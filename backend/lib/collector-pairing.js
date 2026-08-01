import { createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const PAIRING_TTL_MS = 10 * 60 * 1000;
const CREDENTIAL_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function equalDigest(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function nowIso(value) {
  return new Date(value ?? Date.now()).toISOString();
}

function ensureCollections(state) {
  state.collectorPairings ||= [];
  state.collectorCredentials ||= [];
  state.sources ||= [];
}

function pairingError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

export function publicCollectorPairing(pairing) {
  const { codeSha256: _codeSha256, ...publicPairing } = structuredClone(pairing);
  return publicPairing;
}

export function publicCollectorCredential(credential) {
  const { publicKeyPem: _publicKeyPem, ...publicCredential } = structuredClone(credential);
  return publicCredential;
}

export function createCollectorPairing(state, {
  projectId,
  actorSubject,
  expiresInMs = PAIRING_TTL_MS,
  at,
}) {
  ensureCollections(state);
  if (!(state.projects || []).some((project) => project.id === projectId)) {
    throw pairingError('Project not found', 404, 'PROJECT_NOT_FOUND');
  }
  const createdAt = nowIso(at);
  const raw = randomBytes(9).toString('base64url').toUpperCase();
  const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  const pairing = {
    id: `pairing_${randomUUID()}`,
    projectId,
    codeSha256: sha256(code),
    status: 'pending',
    createdBySubject: actorSubject,
    expiresAt: new Date(Date.parse(createdAt) + expiresInMs).toISOString(),
    createdAt,
    updatedAt: createdAt,
  };
  state.collectorPairings.push(pairing);
  return { pairing: publicCollectorPairing(pairing), code };
}

export function claimCollectorPairing(state, {
  pairingId,
  code,
  publicKeyPem,
  deviceName,
  at,
  credentialExpiresInMs = CREDENTIAL_TTL_MS,
}) {
  ensureCollections(state);
  const pairing = state.collectorPairings.find((item) => item.id === pairingId);
  if (!pairing) throw pairingError('Collector pairing not found', 404, 'PAIRING_NOT_FOUND');
  const claimedAt = nowIso(at);
  if (pairing.status !== 'pending') throw pairingError('Collector pairing is no longer claimable', 409, 'PAIRING_NOT_PENDING');
  if (Date.parse(pairing.expiresAt) <= Date.parse(claimedAt)) {
    pairing.status = 'expired';
    pairing.updatedAt = claimedAt;
    throw pairingError('Collector pairing has expired', 410, 'PAIRING_EXPIRED');
  }
  if (!equalDigest(pairing.codeSha256, sha256(String(code || '').toUpperCase()))) {
    throw pairingError('Collector pairing code is invalid', 401, 'PAIRING_CODE_INVALID');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    throw pairingError('Collector public key is invalid', 400, 'COLLECTOR_KEY_INVALID');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw pairingError('Collector public key must be Ed25519', 400, 'COLLECTOR_KEY_INVALID');
  }
  const fingerprint = sha256(publicKey.export({ type: 'spki', format: 'der' }));
  const collectorId = `collector_${randomUUID()}`;
  const source = {
    id: `src_${randomUUID()}`,
    projectId: pairing.projectId,
    name: String(deviceName || 'Local Collector').trim().slice(0, 160),
    type: 'filesystem',
    networkMode: 'outbound_only',
    status: 'active',
    collectorId,
    collectorFingerprint: fingerprint,
    exportPolicy: { rawFileContent: false, rawPaths: false, signedBundlesRequired: true },
    createdAt: claimedAt,
    updatedAt: claimedAt,
  };
  const credential = {
    id: `collector_credential_${randomUUID()}`,
    collectorId,
    projectId: pairing.projectId,
    sourceId: source.id,
    pairingId: pairing.id,
    publicKeyPem,
    publicKeyFingerprint: fingerprint,
    status: 'active',
    expiresAt: new Date(Date.parse(claimedAt) + credentialExpiresInMs).toISOString(),
    createdAt: claimedAt,
    updatedAt: claimedAt,
  };
  state.sources.push(source);
  state.collectorCredentials.push(credential);
  Object.assign(pairing, {
    status: 'claimed',
    collectorId,
    sourceId: source.id,
    claimedAt,
    updatedAt: claimedAt,
  });
  return {
    pairing: publicCollectorPairing(pairing),
    collector: publicCollectorCredential(credential),
    source: structuredClone(source),
  };
}

export function authenticateCollectorSignature(state, { projectId, publicKeyFingerprint, at }) {
  ensureCollections(state);
  const credential = state.collectorCredentials.find((candidate) => (
    candidate.projectId === projectId && equalDigest(candidate.publicKeyFingerprint, publicKeyFingerprint)
  ));
  if (!credential || credential.status !== 'active' || Date.parse(credential.expiresAt) <= Date.parse(nowIso(at))) return null;
  const source = state.sources.find((item) => item.id === credential.sourceId);
  if (!source || source.status !== 'active') return null;
  return {
    credential: structuredClone(credential),
    source: structuredClone(source),
    actor: {
      subject: `service:${credential.collectorId}`,
      email: null,
      roles: ['editor'],
      projects: [credential.projectId],
      kind: 'collector',
    },
  };
}

export function revokeCollectorCredential(state, { collectorId, actorSubject, at }) {
  ensureCollections(state);
  const credential = state.collectorCredentials.find((item) => item.collectorId === collectorId);
  if (!credential) throw pairingError('Collector not found', 404, 'COLLECTOR_NOT_FOUND');
  if (credential.status === 'revoked') return publicCollectorCredential(credential);
  const revokedAt = nowIso(at);
  credential.status = 'revoked';
  credential.revokedAt = revokedAt;
  credential.revokedBySubject = actorSubject;
  credential.updatedAt = revokedAt;
  const source = state.sources.find((item) => item.id === credential.sourceId);
  if (source) {
    source.status = 'disconnected';
    source.disconnectedAt = revokedAt;
    source.updatedAt = revokedAt;
  }
  return publicCollectorCredential(credential);
}
