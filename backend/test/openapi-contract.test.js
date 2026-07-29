import assert from 'node:assert/strict';
import test from 'node:test';
import { openApiDocument } from '../openapi.js';

function containsPlaceholder(value) {
  if (!value || typeof value !== 'object') return false;
  if (value['x-contract-placeholder'] === true) return true;
  return Object.values(value).some(containsPlaceholder);
}

test('OpenAPI exposes concrete request and success response contracts', () => {
  assert.equal(containsPlaceholder(openApiDocument), false);
  for (const [route, operations] of Object.entries(openApiDocument.paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      if (['post', 'put', 'patch', 'delete'].includes(method)) {
        assert.ok(
          operation.requestBody?.content?.['application/json']?.schema,
          `${method.toUpperCase()} ${route} must document its JSON request`
        );
      }
      for (const [status, response] of Object.entries(operation.responses)) {
        if (!status.startsWith('2') || status === '204') continue;
        assert.ok(
          response.content?.['application/json']?.schema || response.content?.['text/plain']?.schema,
          `${method.toUpperCase()} ${route} ${status} must document its response`
        );
      }
    }
  }
});

test('high-risk contracts encode project isolation and explicit export confirmation', () => {
  const exportRequest = openApiDocument.paths['/v1/projects/{projectId}/handoffs/export']
    .post.requestBody.content['application/json'].schema;
  assert.deepEqual(exportRequest.required, ['confirmation']);
  assert.equal(exportRequest.properties.confirmation.const, 'CREATE_LOCAL_HANDOFF_PREVIEW');

  const repositoryRequest = openApiDocument.paths['/v1/projects/{projectId}/repositories/sync']
    .post.requestBody.content['application/json'].schema;
  assert.deepEqual(repositoryRequest.oneOf[0], {
    $ref: '#/components/schemas/GitHubRepositorySyncRequest'
  });
  const githubRepositorySync = openApiDocument.components.schemas.GitHubRepositorySyncRequest;
  assert.deepEqual(githubRepositorySync.required, ['provider', 'owner', 'repo']);
  assert.equal(githubRepositorySync.additionalProperties, false);
});
