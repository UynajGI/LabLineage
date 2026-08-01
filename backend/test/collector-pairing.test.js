import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import {
  authenticateCollectorSignature,
  claimCollectorPairing,
  createCollectorPairing,
  revokeCollectorCredential,
} from '../lib/collector-pairing.js';

function publicKeyPem() {
  return generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' });
}

function state() {
  return { projects: [{ id: 'project_1' }], sources: [], collectorPairings: [], collectorCredentials: [] };
}

test('pairing code is returned once and the collector is bound to its Ed25519 fingerprint', () => {
  const fixture = state();
  const created = createCollectorPairing(fixture, {
    projectId: 'project_1', actorSubject: 'admin', at: '2026-08-02T00:00:00Z',
  });
  assert.match(created.code, /^[A-Z0-9_-]{4}-[A-Z0-9_-]{4}-[A-Z0-9_-]{4}$/u);
  assert.equal(JSON.stringify(fixture).includes(created.code), false);

  const claimed = claimCollectorPairing(fixture, {
    pairingId: created.pairing.id,
    code: created.code.toLowerCase(),
    publicKeyPem: publicKeyPem(),
    deviceName: 'Microscope workstation',
    at: '2026-08-02T00:01:00Z',
  });
  assert.equal(claimed.source.exportPolicy.rawFileContent, false);
  assert.equal(claimed.source.exportPolicy.rawPaths, false);
  assert.equal(claimed.source.projectId, 'project_1');

  const authenticated = authenticateCollectorSignature(fixture, {
    projectId: 'project_1',
    publicKeyFingerprint: claimed.collector.publicKeyFingerprint,
    at: '2026-08-02T00:02:00Z',
  });
  assert.equal(authenticated.actor.kind, 'collector');
  assert.deepEqual(authenticated.actor.projects, ['project_1']);
  assert.deepEqual(authenticated.actor.roles, ['editor']);
});

test('pairing is one-time, expires, and rejects non-Ed25519 keys', () => {
  const fixture = state();
  const created = createCollectorPairing(fixture, {
    projectId: 'project_1', actorSubject: 'admin', expiresInMs: 1_000,
    at: '2026-08-02T00:00:00Z',
  });
  assert.throws(
    () => claimCollectorPairing(fixture, {
      pairingId: created.pairing.id, code: created.code, publicKeyPem: 'invalid', deviceName: 'device',
      at: '2026-08-02T00:00:01.001Z',
    }),
    /expired/u,
  );

  const fresh = createCollectorPairing(fixture, {
    projectId: 'project_1', actorSubject: 'admin', at: '2026-08-02T00:01:00Z',
  });
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' });
  assert.throws(
    () => claimCollectorPairing(fixture, {
      pairingId: fresh.pairing.id, code: fresh.code, publicKeyPem: rsa, deviceName: 'device',
      at: '2026-08-02T00:01:01Z',
    }),
    /must be Ed25519/u,
  );
});

test('revocation immediately disables the collector and disconnects its source', () => {
  const fixture = state();
  const created = createCollectorPairing(fixture, { projectId: 'project_1', actorSubject: 'admin' });
  const claimed = claimCollectorPairing(fixture, {
    pairingId: created.pairing.id, code: created.code, publicKeyPem: publicKeyPem(), deviceName: 'device',
  });
  const revoked = revokeCollectorCredential(fixture, {
    collectorId: claimed.collector.collectorId, actorSubject: 'admin',
  });
  assert.equal(revoked.status, 'revoked');
  assert.equal(fixture.sources[0].status, 'disconnected');
  assert.equal(authenticateCollectorSignature(fixture, {
    projectId: 'project_1', publicKeyFingerprint: claimed.collector.publicKeyFingerprint,
  }), null);
});
