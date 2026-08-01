const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'be', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to', 'with',
  '一个', '以及', '作为', '使用', '完成', '项目', '生成', '能够', '需要', '通过', '这个', '进行',
]);

function words(value) {
  return [...new Set(String(value || '').toLocaleLowerCase()
    .split(/[^\p{L}\p{N}_.\-/]+/u)
    .flatMap((part) => part.split(/[_.\-/]+/u))
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && !STOP_WORDS.has(part)))];
}

function normalizedPath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//u, '').toLocaleLowerCase();
}

function searchableEvidence(evidence, nodes) {
  const nodeByEvidence = new Map();
  for (const node of nodes) {
    for (const evidenceId of node.evidenceIds || []) {
      const values = nodeByEvidence.get(evidenceId) || [];
      values.push(node);
      nodeByEvidence.set(evidenceId, values);
    }
  }
  return evidence.map((item) => {
    const linkedNodes = nodeByEvidence.get(item.id) || [];
    const text = [
      item.evidenceType,
      item.source,
      JSON.stringify(item.payload || {}),
      ...linkedNodes.flatMap((node) => [node.label, node.type, JSON.stringify(node.details || {})]),
    ].join(' ').toLocaleLowerCase();
    const paths = [
      item.payload?.pathToken,
      item.payload?.logicalPath,
      ...linkedNodes.flatMap((node) => [node.pathToken, node.details?.pathToken, node.label]),
    ].filter(Boolean).map(normalizedPath);
    return { item, linkedNodes, text, paths };
  });
}

function conflictingFindingIds(matches, findings) {
  const evidenceIds = new Set(matches.map((match) => match.item.id));
  const nodeIds = new Set(matches.flatMap((match) => match.linkedNodes.map((node) => node.id)));
  return findings.filter((finding) => (
    finding.status === 'open'
    && (finding.type === 'conflict' || finding.severity === 'P0')
    && (
      (finding.evidenceIds || []).some((id) => evidenceIds.has(id))
      || (finding.affectedEntities || []).some((id) => nodeIds.has(id))
    )
  )).map((finding) => finding.id);
}

function resultFor({ id, label, required, expectedPathHint, index }, records, findings, kind) {
  const hint = normalizedPath(expectedPathHint);
  const labelWords = words(label);
  const exact = hint ? records.filter((record) => record.paths.some((candidate) => (
    candidate === hint || candidate.endsWith(`/${hint}`)
  ))) : [];
  const matched = exact.length > 0 ? exact : records.filter((record) => (
    labelWords.length > 0 && labelWords.some((word) => record.text.includes(word))
  ));
  const evidenceIds = [...new Set(matched.map((record) => record.item.id))].sort();
  const conflictIds = conflictingFindingIds(matched, findings);

  let status;
  let reason;
  if (conflictIds.length > 0) {
    status = 'conflicted';
    reason = 'Matching evidence has an unresolved deterministic conflict.';
  } else if (exact.length > 0) {
    status = 'supported';
    reason = 'The expected project-relative path is present in deterministic file evidence.';
  } else if (matched.length > 0) {
    status = 'partial';
    reason = 'Related evidence exists, but it does not deterministically prove the full requirement.';
  } else if (labelWords.length === 0) {
    status = 'not_assessable';
    reason = 'The requirement has no machine-matchable evidence hint.';
  } else {
    status = 'missing';
    reason = expectedPathHint
      ? 'No deterministic file evidence matches the expected project-relative path.'
      : 'No deterministic evidence matches the requirement.';
  }
  return {
    id,
    kind,
    label,
    required: Boolean(required),
    sortOrder: index,
    status,
    evidenceIds,
    conflictIds,
    reason,
  };
}

export function assertAssessmentEvidence(report, validEvidenceIds) {
  const valid = validEvidenceIds instanceof Set ? validEvidenceIds : new Set(validEvidenceIds);
  for (const result of [...report.criterionResults, ...report.keyOutputResults]) {
    for (const evidenceId of result.evidenceIds) {
      if (!valid.has(evidenceId)) throw new Error(`Assessment references unknown evidence: ${evidenceId}`);
    }
    if (['supported', 'partial'].includes(result.status) && result.evidenceIds.length === 0) {
      throw new Error(`Assessment ${result.id} is ${result.status} without evidence`);
    }
  }
  return report;
}

export function assessProjectObjective({ intent, evidence = [], nodes = [], findings = [], audit = null }) {
  const records = searchableEvidence(evidence, nodes);
  const criterionResults = (intent.successCriteria || []).map((criterion, index) => resultFor({
    id: criterion.id,
    label: criterion.description,
    required: criterion.required,
    index: criterion.sortOrder ?? index,
  }, records, findings, 'criterion'));
  const keyOutputResults = (intent.keyOutputs || []).map((output, index) => resultFor({
    id: output.id,
    label: output.name,
    required: output.required,
    expectedPathHint: output.expectedPathHint,
    index: output.sortOrder ?? index,
  }, records, findings, 'key_output'));
  const results = [...criterionResults, ...keyOutputResults];
  const required = results.filter((result) => result.required);
  const scored = required.length > 0 ? required : results;
  const points = { supported: 1, partial: 0.5, missing: 0, conflicted: 0, not_assessable: 0 };
  const coverageScore = scored.length === 0
    ? 0
    : Math.round(100 * scored.reduce((total, result) => total + points[result.status], 0) / scored.length);
  const overallStatus = scored.some((result) => result.status === 'conflicted')
    ? 'conflicted'
    : scored.length > 0 && scored.every((result) => result.status === 'supported')
      ? 'supported'
      : scored.length > 0 && scored.every((result) => result.status === 'not_assessable')
        ? 'not_assessable'
        : coverageScore === 0
          ? 'missing'
          : 'partial';
  const report = {
    schemaVersion: 'lablineage.objective-assessment.v1',
    intentVersionId: intent.id,
    intentVersion: intent.version,
    objective: intent.objective,
    overallStatus,
    coverageScore,
    criterionResults,
    keyOutputResults,
    findingIds: findings.filter((finding) => finding.status === 'open').map((finding) => finding.id).sort(),
    audit: audit ? { id: audit.id, level: audit.level, score: audit.score } : null,
    missingEvidence: results.filter((result) => ['missing', 'not_assessable'].includes(result.status)).map((result) => ({
      resultId: result.id,
      reason: result.reason,
    })),
    conflicts: results.filter((result) => result.status === 'conflicted').map((result) => ({
      resultId: result.id,
      findingIds: result.conflictIds,
    })),
    limitations: [
      'Coverage measures available evidence, not scientific correctness.',
      'A partial match cannot confirm that a success criterion has been fulfilled.',
    ],
  };
  return assertAssessmentEvidence(report, new Set(evidence.map((item) => item.id)));
}
