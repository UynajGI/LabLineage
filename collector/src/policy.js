import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';

function directoryExclusion(pattern) {
  const normalized = pattern.replaceAll('\\', '/');
  const match = normalized.match(/^(?:\*\*\/)?([^*?[\]{}]+?)(?:\/\*\*)?\/?$/);
  if (!match) throw new Error(`Unsupported exclusion glob: ${pattern}`);
  return match[1].replace(/^\/+|\/+$/g, '');
}

export async function loadPolicy(filename, expectedProject) {
  if (!filename) return {};
  const resolved = path.resolve(filename);
  let policy;
  try {
    const source = await readFile(resolved, 'utf8');
    policy = resolved.endsWith('.json') ? JSON.parse(source) : parse(source);
  } catch (error) {
    throw new Error(`Cannot load policy ${resolved}: ${error.message}`);
  }
  if (policy?.schema_version !== 'lablineage.policy.v1') {
    throw new Error('Policy schema_version must be lablineage.policy.v1');
  }
  if (expectedProject && policy.project?.key && policy.project.key !== expectedProject) {
    throw new Error(`Policy project ${policy.project.key} does not match ${expectedProject}`);
  }
  if (policy.scan?.follow_symlinks === true) throw new Error('Following symlinks is forbidden');
  if (policy.export?.raw_file_content === true || policy.export?.raw_paths === true) {
    throw new Error('Raw file content and raw paths cannot be exported');
  }
  const fullHashMaxBytes = policy.hashing?.full_hash_max_bytes;
  const sampleChunkBytes = policy.hashing?.sampled_chunk_bytes;
  if (fullHashMaxBytes !== undefined && (!Number.isSafeInteger(fullHashMaxBytes) || fullHashMaxBytes < 64 * 1024 * 1024)) {
    throw new Error('hashing.full_hash_max_bytes must be an integer of at least 64 MiB');
  }
  if (sampleChunkBytes !== undefined && (!Number.isSafeInteger(sampleChunkBytes) || sampleChunkBytes < 1024 * 1024)) {
    throw new Error('hashing.sampled_chunk_bytes must be an integer of at least 1 MiB');
  }
  return {
    exclusions: (policy.scan?.exclude || []).map(directoryExclusion),
    fullHashMaxBytes,
    sampleChunkBytes,
    classification: policy.project?.classification
  };
}
