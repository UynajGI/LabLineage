import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import { z } from 'zod';

const recordSchema = z.object({
  record_type: z.enum(['asset', 'run', 'lineage_edge', 'code_version', 'parameter_set', 'environment']),
  asset_id: z.string().optional(),
  run_id: z.string().optional(),
  from_entity_id: z.string().optional(),
  to_entity_id: z.string().optional(),
  relation_type: z.string().optional(),
  path_token: z.string().optional(),
  name: z.string().optional(),
  asset_type: z.string().optional(),
  content_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  size_bytes: z.number().int().nonnegative().optional(),
  modified_at: z.iso.datetime().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  format: z.string().max(20).optional(),
  exit_code: z.number().int().optional(),
  command_redacted: z.string().optional(),
  execution_mode: z.enum(['controlled-rerun']).optional(),
  verification_status: z.enum(['captured', 'verified', 'failed']).optional(),
  rerun_hash_match: z.boolean().optional(),
  expected_hash: z.string().nullable().optional(),
  observed_hash: z.string().optional(),
  confidence_label: z.enum(['exact', 'strong', 'inferred', 'hypothesis', 'human_verified', 'unknown']).optional(),
  evidence_ids: z.array(z.string()).optional()
}).passthrough();

export const manifestSchema = z.object({
  schema_version: z.literal('lablineage.manifest.v1'),
  bundle_id: z.string().min(1),
  project_key: z.string().min(1),
  captured_at: z.iso.datetime().optional(),
  root_path_token: z.string().startsWith('pth_').optional(),
  records: z.array(recordSchema).max(50_000)
}).passthrough();

const signedBundleSchema = z.object({
  manifest: manifestSchema,
  signature: z.object({
    algorithm: z.literal('Ed25519'),
    public_key_pem: z.string().min(1),
    value_base64: z.string().min(1)
  })
});

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function rejectSensitiveFields(value, path = 'manifest') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitiveFields(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (['absolute_path', 'raw_path', 'access_token', 'refresh_token', 'api_key', 'password', 'secret_value'].includes(normalized)) {
      throw Object.assign(new Error(`Sensitive field is forbidden: ${path}.${key}`), { statusCode: 400 });
    }
    rejectSensitiveFields(child, `${path}.${key}`);
  }
}

function publicKeyFingerprint(publicKeyPem) {
  const der = createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  return createHash('sha256').update(der).digest('hex');
}

export function verifyManifestBundle(raw, options = {}) {
  const bundle = signedBundleSchema.parse(raw);
  const valid = verify(
    null,
    Buffer.from(canonicalJson(bundle.manifest)),
    createPublicKey(bundle.signature.public_key_pem),
    Buffer.from(bundle.signature.value_base64, 'base64')
  );
  if (!valid) throw Object.assign(new Error('Manifest signature is invalid'), { statusCode: 400 });
  const fingerprint = publicKeyFingerprint(bundle.signature.public_key_pem);
  const trusted = options.trustedFingerprints || [];
  if (trusted.length && !trusted.includes(fingerprint)) {
    throw Object.assign(new Error('Manifest signer is not trusted'), { statusCode: 403 });
  }
  return { manifest: bundle.manifest, signerFingerprint: fingerprint };
}

export function unwrapManifest(raw, options = {}) {
  rejectSensitiveFields(raw);
  if (raw?.manifest && raw?.signature) return verifyManifestBundle(raw, options);
  if (options.requireSignature) {
    throw Object.assign(new Error('A signed manifest bundle is required'), { statusCode: 400 });
  }
  return { manifest: manifestSchema.parse(raw), signerFingerprint: null };
}

const typeMap = {
  asset: 'Dataset',
  code_version: 'CodeVersion',
  parameter_set: 'ParameterSet',
  environment: 'Environment',
  run: 'Run'
};

export function importManifest(raw, projectId, options = {}) {
  const { manifest, signerFingerprint } = unwrapManifest(raw, options);
  const nodes = [];
  const edges = [];
  const evidence = new Map();
  for (const record of manifest.records) {
    const defaultEvidenceId = `ev_${createHash('sha256').update(canonicalJson({ bundleId: manifest.bundle_id, record })).digest('hex').slice(0, 32)}`;
    const evidenceIds = record.evidence_ids?.length ? record.evidence_ids : [defaultEvidenceId];
    for (const evidenceId of evidenceIds) {
      evidence.set(evidenceId, {
        id: evidenceId,
        projectId,
        evidenceType: 'manifest_record',
        source: 'edge_collector',
        capturedAt: manifest.captured_at || new Date().toISOString(),
        bundleId: manifest.bundle_id,
        signerFingerprint,
        payload: record
      });
    }
    if (record.record_type === 'lineage_edge') {
      if (!record.from_entity_id || !record.to_entity_id || !record.relation_type) continue;
      edges.push({
        source: record.from_entity_id,
        target: record.to_entity_id,
        relation: record.relation_type,
        confidence: record.confidence_label || 'unknown',
        evidenceIds,
        ...(record.expected_hash ? { expectedHash: record.expected_hash } : {}),
        ...(record.observed_hash ? { observedHash: record.observed_hash } : {})
      });
      continue;
    }
    const id = record.asset_id || record.run_id || `${record.record_type}_${randomUUID()}`;
    const inferredType = record.asset_type === 'figure' ? 'Figure' : typeMap[record.record_type];
    nodes.push({
      id,
      projectId,
      type: inferredType,
      label: record.name || record.path_token || id,
      status: 'candidate',
      details: {
        ...(record.content_hash ? { hash: record.content_hash } : {}),
        ...(record.size_bytes !== undefined ? { sizeBytes: String(record.size_bytes) } : {}),
        ...(record.modified_at ? { modifiedAt: record.modified_at } : {}),
        ...(record.width !== undefined ? { width: String(record.width) } : {}),
        ...(record.height !== undefined ? { height: String(record.height) } : {}),
        ...(record.format ? { format: record.format } : {}),
        ...(record.exit_code !== undefined ? { exitCode: String(record.exit_code) } : {}),
        ...(record.command_redacted ? { command: record.command_redacted } : {}),
        ...(record.execution_mode ? { executionMode: record.execution_mode } : {}),
        ...(record.verification_status ? { verificationStatus: record.verification_status } : {}),
        ...(record.rerun_hash_match !== undefined ? { rerunHashMatch: String(record.rerun_hash_match) } : {})
      },
      evidenceIds
    });
  }
  return { manifest, nodes, edges, evidence: [...evidence.values()], signerFingerprint };
}
