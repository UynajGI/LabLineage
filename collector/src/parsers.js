import path from 'node:path';
import { parse as parseYaml } from 'yaml';

const PYTHON_CALLS = [
  { re: /\b(?:open|Path)\s*\(\s*(['"])([^'"]+)\1/g, relation: 'reads_from' },
  { re: /\b(?:read_csv|read_json|read_parquet|load|imread)\s*\(\s*(['"])([^'"]+)\1/g, relation: 'reads_from' },
  { re: /\.(?:to_csv|to_json|to_parquet|save|savefig|imsave)\s*\(\s*(['"])([^'"]+)\1/g, relation: 'writes_to' }
];

function safePath(candidate) {
  if (!candidate || candidate.includes('\0') || candidate.length > 2048) return null;
  return candidate.replaceAll('\\', '/');
}

export function parsePython(source, codePath) {
  const evidence = [];
  for (const pattern of PYTHON_CALLS) {
    pattern.re.lastIndex = 0;
    for (const match of source.matchAll(pattern.re)) {
      const referencedPath = safePath(match[2]);
      if (!referencedPath) continue;
      const prefix = source.slice(0, match.index);
      evidence.push({
        parser: 'python-static-v1',
        relation: pattern.relation,
        code_path: codePath,
        referenced_path: referencedPath,
        line: prefix.split(/\r?\n/).length,
        confidence_label: 'strong'
      });
    }
  }
  return evidence;
}

export function parseNotebook(source, notebookPath) {
  let notebook;
  try {
    notebook = JSON.parse(source);
  } catch {
    return [];
  }
  if (!Array.isArray(notebook.cells)) return [];
  const evidence = notebook.cells.flatMap((cell, index) => {
    if (cell.cell_type !== 'code') return [];
    const code = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source || '');
    const codePath = `${notebookPath}#cell-${index + 1}`;
    const parsed = parsePython(code, codePath).map((item) => ({
      ...item,
      parser: 'notebook-python-static-v1',
      execution_count: cell.execution_count ?? null
    }));
    for (const output of cell.outputs || []) {
      const text = Array.isArray(output.text)
        ? output.text.join('')
        : typeof output.text === 'string'
          ? output.text
          : '';
      parsed.push(...parseLog(text, codePath).map((item) => ({
        ...item,
        parser: 'notebook-output-v1',
        execution_count: cell.execution_count ?? null
      })));
    }
    return parsed;
  });
  if (notebook.metadata?.kernelspec || notebook.metadata?.language_info) {
    evidence.push({
      parser: 'notebook-metadata-v1',
      record_type: 'parameter_set',
      code_path: notebookPath,
      parameters: {
        kernel: notebook.metadata.kernelspec?.name || notebook.metadata.kernelspec?.display_name || 'unknown',
        language: notebook.metadata.language_info?.name || 'unknown',
        language_version: notebook.metadata.language_info?.version || 'unknown'
      }
    });
  }
  return evidence;
}

export function parseLog(source, logPath) {
  const evidence = [];
  const lines = source.split(/\r?\n/);
  const pathPatterns = [
    { re: /\b(?:read(?:ing)?|load(?:ed|ing)?)\s+(?:from\s+)?["']?([^"'\s]+\.[A-Za-z0-9]{1,12})/i, relation: 'reads_from' },
    { re: /\b(?:wrote|writing|saved?|exported?)\s+(?:to\s+)?["']?([^"'\s]+\.[A-Za-z0-9]{1,12})/i, relation: 'writes_to' }
  ];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const item = JSON.parse(trimmed);
        for (const [field, relation] of [['input', 'reads_from'], ['input_path', 'reads_from'], ['output', 'writes_to'], ['output_path', 'writes_to']]) {
          const referenced = safePath(item[field]);
          if (referenced) evidence.push({ parser: 'structured-log-v1', relation, code_path: logPath, referenced_path: referenced, line: index + 1, confidence_label: 'exact' });
        }
        if (Number.isInteger(item.exit_code)) {
          evidence.push({ parser: 'structured-log-v1', relation: 'run_status', code_path: logPath, exit_code: item.exit_code, line: index + 1, confidence_label: 'exact' });
        }
        return;
      } catch {
        // Fall through to conservative text patterns.
      }
    }
    for (const pattern of pathPatterns) {
      const match = pattern.re.exec(trimmed);
      const referenced = safePath(match?.[1]);
      if (referenced) evidence.push({ parser: 'text-log-v1', relation: pattern.relation, code_path: logPath, referenced_path: referenced, line: index + 1, confidence_label: 'strong' });
    }
    if (/\b(?:traceback|fatal|uncaught|segmentation fault|error)\b/i.test(trimmed)) {
      evidence.push({ parser: 'text-log-v1', relation: 'run_failure_signal', code_path: logPath, line: index + 1, confidence_label: 'strong' });
    }
    if (/\b(?:out[- ]of[- ]memory|oom[- ]kill|oom_kill|exceeded.*memory)\b/i.test(trimmed)) {
      evidence.push({ parser: 'slurm-log-v1', relation: 'run_failure_signal', failure_reason: 'out_of_memory', code_path: logPath, line: index + 1, confidence_label: 'strong' });
    }
    if (/\b(?:time limit|timed out|timeout|deadline exceeded)\b/i.test(trimmed)) {
      evidence.push({ parser: 'slurm-log-v1', relation: 'run_failure_signal', failure_reason: 'timeout', code_path: logPath, line: index + 1, confidence_label: 'strong' });
    }
    const slurmState = trimmed.match(/\b(?:JobState|State)\s*[=:]\s*([A-Z_]+)/);
    if (slurmState) {
      evidence.push({
        parser: 'slurm-log-v1',
        relation: 'run_status',
        job_state: slurmState[1],
        code_path: logPath,
        line: index + 1,
        confidence_label: 'exact'
      });
    }
  });
  return evidence;
}

const SECRET_KEY = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|passwd|private[_-]?key|credential|authorization)/i;

function safeParameterValue(key, value) {
  if (SECRET_KEY.test(key)) return '[REDACTED]';
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => safeParameterValue(key, item));
  if (typeof value === 'string') return '[REDACTED_STRING]';
  return undefined;
}

function flattenParameters(value, prefix = '', output = {}, state = { count: 0, seen: new WeakSet() }, depth = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 8 || state.seen.has(value)) return output;
  state.seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (state.count >= 500) break;
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (fullKey.length > 256 || /[\r\n\0]/.test(fullKey)) continue;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      flattenParameters(child, fullKey, output, state, depth + 1);
      continue;
    }
    const safe = safeParameterValue(fullKey, child);
    if (safe !== undefined) {
      output[fullKey] = safe;
      state.count += 1;
    }
  }
  return output;
}

function parseIni(source) {
  const result = {};
  let section = '';
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^[#;]/.test(trimmed)) continue;
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    const item = trimmed.match(/^([^=:#]+)\s*[=:]\s*(.*)$/);
    if (!item) continue;
    const key = section ? `${section}.${item[1].trim()}` : item[1].trim();
    const raw = item[2].trim();
    result[key] = /^(?:true|false)$/i.test(raw)
      ? raw.toLowerCase() === 'true'
      : /^-?(?:\d+|\d*\.\d+)$/.test(raw)
        ? Number(raw)
        : raw.replace(/^['"]|['"]$/g, '');
  }
  return result;
}

function parseToml(source) {
  return parseIni(source.replace(/^\s*\[\[([^\]]+)\]\]\s*$/gm, '[$1]'));
}

export function parseConfig(source, configPath) {
  const extension = path.extname(configPath).toLowerCase();
  let parsed;
  try {
    if (extension === '.json') parsed = JSON.parse(source);
    else if (extension === '.yaml' || extension === '.yml') parsed = parseYaml(source);
    else if (extension === '.toml') parsed = parseToml(source);
    else if (extension === '.ini' || extension === '.cfg') parsed = parseIni(source);
    else return [];
  } catch {
    return [];
  }
  const parameters = extension === '.toml' || extension === '.ini' || extension === '.cfg'
    ? Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, safeParameterValue(key, value)]))
    : flattenParameters(parsed);
  return [{
    parser: 'config-parameters-v1',
    record_type: 'parameter_set',
    code_path: configPath,
    parameters
  }];
}

export function imageMetadata(bytes, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png' && bytes.length >= 24 && bytes.subarray(1, 4).toString('ascii') === 'PNG') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: 'png' };
  }
  if (['.jpg', '.jpeg'].includes(extension) && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5), format: 'jpeg' };
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return {};
}

export function artifactType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.svg', '.pdf'].includes(extension)) return 'figure';
  if (['.py', '.ipynb', '.r', '.jl', '.sh'].includes(extension)) return 'code';
  if (['.json', '.yaml', '.yml', '.toml', '.ini', '.cfg'].includes(extension)) return 'config';
  if (['.csv', '.tsv', '.parquet'].includes(extension)) return 'dataset';
  if (['.log', '.out', '.err'].includes(extension)) return 'log';
  return 'file';
}
