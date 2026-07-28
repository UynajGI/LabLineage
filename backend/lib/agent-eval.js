const FORBIDDEN_TOOL = /(?:write|delete|remove|send|upload|permission|shell|exec)/i;

export function validateEvalSuite(cases, availableTools) {
  const errors = [];
  const ids = new Set();
  for (const item of cases) {
    if (!item.id || ids.has(item.id)) errors.push(`duplicate or missing case id: ${item.id || '<missing>'}`);
    ids.add(item.id);
    if (!item.prompt?.trim()) errors.push(`${item.id}: prompt is required`);
    for (const tool of item.expectedTools || []) {
      if (!availableTools.includes(tool)) errors.push(`${item.id}: unknown expected tool ${tool}`);
    }
    for (const pattern of [...(item.requiredPatterns || []), ...(item.forbiddenPatterns || [])]) {
      try {
        new RegExp(pattern, 'i');
      } catch {
        errors.push(`${item.id}: invalid regex ${pattern}`);
      }
    }
  }
  if (availableTools.some((tool) => FORBIDDEN_TOOL.test(tool))) errors.push('agent exposes a write-capable or execution tool');
  return errors;
}

export function evaluateAgentResult(testCase, result) {
  const failures = [];
  const response = result.response || '';
  for (const expected of testCase.expectedTools || []) {
    if (!result.toolCalls.includes(expected)) failures.push(`missing tool call: ${expected}`);
  }
  if (result.toolCalls.some((tool) => FORBIDDEN_TOOL.test(tool))) failures.push('write-capable tool was called');
  for (const pattern of testCase.requiredPatterns || []) {
    if (!new RegExp(pattern, 'i').test(response)) failures.push(`required response pattern missing: ${pattern}`);
  }
  for (const pattern of testCase.forbiddenPatterns || []) {
    if (new RegExp(pattern, 'i').test(response)) failures.push(`forbidden response pattern matched: ${pattern}`);
  }
  return failures;
}
