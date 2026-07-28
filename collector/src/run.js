import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';

const SECRET_ARGUMENT = /(?:token|secret|password|passwd|api[_-]?key|authorization)=/i;

function redactArgument(argument) {
  if (SECRET_ARGUMENT.test(argument)) {
    const separator = argument.indexOf('=');
    return separator >= 0 ? `${argument.slice(0, separator + 1)}[REDACTED]` : '[REDACTED]';
  }
  return argument.replace(/:\/\/([^:/\s]+):([^@\s]+)@/g, '://$1:[REDACTED]@');
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function captureRun({
  root,
  command,
  args = [],
  timeoutMs = 60 * 60 * 1000,
  maxOutputBytes = 10 * 1024 * 1024,
  environmentAllowlist = ['LANG', 'LC_ALL', 'TZ']
}) {
  if (!command) throw new Error('A command is required');
  const resolvedRoot = path.resolve(root);
  const runId = `run_${randomUUID()}`;
  const startedAt = new Date().toISOString();
  const stdout = [];
  const stderr = [];
  let outputBytes = 0;
  let exceeded = false;
  const child = spawn(command, args, {
    cwd: resolvedRoot,
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const capture = (target) => (chunk) => {
    outputBytes += chunk.length;
    if (outputBytes > maxOutputBytes) {
      exceeded = true;
      child.kill();
      return;
    }
    target.push(chunk);
  };
  child.stdout.on('data', capture(stdout));
  child.stderr.on('data', capture(stderr));
  const timer = setTimeout(() => child.kill(), timeoutMs);
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }));
  }).finally(() => clearTimeout(timer));
  const stdoutBytes = Buffer.concat(stdout);
  const stderrBytes = Buffer.concat(stderr);
  const endedAt = new Date().toISOString();
  const timedOut = Date.parse(endedAt) - Date.parse(startedAt) >= timeoutMs;
  const environment = Object.fromEntries(
    environmentAllowlist.filter((name) => process.env[name] !== undefined).map((name) => [name, process.env[name]])
  );
  return {
    record_type: 'run',
    run_id: runId,
    name: `${path.basename(command)} ${args.map(redactArgument).join(' ')}`.trim(),
    command_redacted: [command, ...args.map(redactArgument)].join(' '),
    started_at: startedAt,
    ended_at: endedAt,
    exit_code: result.exitCode ?? (timedOut ? 124 : 1),
    signal: result.signal,
    execution_mode: 'controlled-rerun',
    verification_status: result.exitCode === 0 && !exceeded ? 'captured' : 'failed',
    stdout_sha256: digest(stdoutBytes),
    stderr_sha256: digest(stderrBytes),
    output_truncated: exceeded,
    environment
  };
}

export function attachRunEvidence(before, after, runRecord, expectedManifest) {
  const previous = new Map(before.records.filter((record) => record.record_type === 'asset').map((record) => [record.asset_id, record]));
  const expected = new Map((expectedManifest?.records || []).filter((record) => record.record_type === 'asset').map((record) => [record.asset_id, record]));
  const changed = after.records.filter((record) => (
    record.record_type === 'asset' && previous.get(record.asset_id)?.content_hash !== record.content_hash
  ));
  const records = after.records.map((record) => {
    if (record.record_type !== 'asset') return record;
    const expectedRecord = expected.get(record.asset_id);
    return expectedRecord
      ? { ...record, rerun_hash_match: expectedRecord.content_hash === record.content_hash }
      : record;
  });
  records.push(runRecord);
  for (const output of changed) {
    const expectedRecord = expected.get(output.asset_id);
    records.push({
      record_type: 'lineage_edge',
      from_entity_id: runRecord.run_id,
      to_entity_id: output.asset_id,
      relation_type: 'generated',
      confidence_label: 'exact',
      evidence_ids: [`ev_${runRecord.run_id}_output_${output.asset_id}`],
      expected_hash: expectedRecord?.content_hash || null,
      observed_hash: output.content_hash
    });
  }
  const verified = runRecord.exit_code === 0 &&
    changed.length > 0 &&
    changed.every((output) => expected.get(output.asset_id)?.content_hash === output.content_hash);
  const normalizedRun = {
    ...runRecord,
    verification_status: verified ? 'verified' : runRecord.verification_status,
    evidence_ids: [`ev_${runRecord.run_id}_execution`]
  };
  const index = records.findIndex((record) => record.run_id === runRecord.run_id);
  records[index] = normalizedRun;
  return {
    ...after,
    bundle_id: `bnd_${randomUUID()}`,
    run_capture: { run_id: runRecord.run_id, changed_outputs: changed.length, verified },
    records
  };
}
