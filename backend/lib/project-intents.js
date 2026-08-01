import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const boundedText = (max) => z.string().trim().min(1).max(max);

const successCriterionSchema = z.union([
  boundedText(1000).transform((description) => ({ description, required: true })),
  z.object({
    description: boundedText(1000),
    required: z.boolean().default(true)
  }).strict()
]);

const keyOutputSchema = z.union([
  boundedText(300).transform((name) => ({ name, kind: 'artifact', required: true })),
  z.object({
    name: boundedText(300),
    kind: z.enum(['artifact', 'code', 'dataset', 'figure', 'report', 'environment', 'other']).default('artifact'),
    expectedPathHint: boundedText(500).optional(),
    required: z.boolean().default(true)
  }).strict()
]);

export const projectIntentSchema = z.object({
  objective: boundedText(4000),
  successCriteria: z.array(successCriterionSchema).min(1).max(20),
  keyOutputs: z.array(keyOutputSchema).max(20).default([]),
  constraints: z.array(boundedText(1000)).max(20).default([])
}).strict();

export const createProjectSchema = z.object({
  name: boundedText(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).optional(),
  objective: boundedText(4000),
  successCriteria: z.array(successCriterionSchema).min(1).max(20),
  keyOutputs: z.array(keyOutputSchema).max(20).default([]),
  constraints: z.array(boundedText(1000)).max(20).default([])
}).strict();

export const createIntentVersionSchema = projectIntentSchema.extend({
  expectedVersion: z.number().int().min(1)
}).strict();

export function currentProjectIntent(state, projectId) {
  return (state.projectIntents || [])
    .filter((intent) => intent.projectId === projectId)
    .sort((left, right) => right.version - left.version)[0] || null;
}

export function serializeProjectIntent(state, intent) {
  if (!intent) return null;
  return {
    ...intent,
    successCriteria: (state.projectSuccessCriteria || [])
      .filter((criterion) => criterion.intentId === intent.id)
      .sort((left, right) => left.sortOrder - right.sortOrder),
    keyOutputs: (state.projectKeyOutputs || [])
      .filter((output) => output.intentId === intent.id)
      .sort((left, right) => left.sortOrder - right.sortOrder)
  };
}

export function appendProjectIntent(state, {
  projectId,
  objective,
  successCriteria,
  keyOutputs = [],
  constraints = [],
  actorSubject,
  version,
  legacy = false,
  now = new Date().toISOString()
}) {
  state.projectIntents ||= [];
  state.projectSuccessCriteria ||= [];
  state.projectKeyOutputs ||= [];
  const intent = {
    id: `intent_${randomUUID()}`,
    projectId,
    version,
    objective,
    constraints,
    legacy,
    createdBySubject: actorSubject,
    createdAt: now
  };
  state.projectIntents.push(intent);
  successCriteria.forEach((criterion, sortOrder) => {
    state.projectSuccessCriteria.push({
      id: `criterion_${randomUUID()}`,
      projectId,
      intentId: intent.id,
      description: criterion.description,
      required: criterion.required,
      sortOrder,
      createdAt: now
    });
  });
  keyOutputs.forEach((output, sortOrder) => {
    state.projectKeyOutputs.push({
      id: `output_${randomUUID()}`,
      projectId,
      intentId: intent.id,
      name: output.name,
      kind: output.kind,
      expectedPathHint: output.expectedPathHint || null,
      required: output.required,
      sortOrder,
      createdAt: now
    });
  });
  const project = state.projects.find((item) => item.id === projectId);
  if (project) {
    project.currentIntentVersion = version;
    project.updatedAt = now;
  }
  return serializeProjectIntent(state, intent);
}

export function projectDetail(state, projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) return null;
  return {
    ...project,
    intent: serializeProjectIntent(state, currentProjectIntent(state, projectId))
  };
}

export class IntentVersionConflictError extends Error {}

export function appendNextProjectIntent(state, projectId, input, actorSubject) {
  const current = currentProjectIntent(state, projectId);
  if (!current || current.version !== input.expectedVersion) {
    throw new IntentVersionConflictError('Project intent version is stale');
  }
  return appendProjectIntent(state, {
    projectId,
    objective: input.objective,
    successCriteria: input.successCriteria,
    keyOutputs: input.keyOutputs,
    constraints: input.constraints,
    actorSubject,
    version: current.version + 1
  });
}
