import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { MCPToolset } from '@google/adk';
import {
  getMcpInternalToken,
  handleReadOnlyMcpRequest,
  requireInternalMcpToken
} from '../lib/mcp-server.js';
import { makeDemoState } from '../lib/store.js';

test('ADK MCPToolset discovers and calls only bounded read-only evidence tools', async () => {
  const store = { get: () => makeDemoState() };
  const projectId = store.get().projects[0].id;
  const app = express();
  app.use(express.json());
  app.post('/mcp/projects/:projectId', requireInternalMcpToken, (req, res) =>
    handleReadOnlyMcpRequest(store, req, res)
  );
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const address = server.address();
  const toolset = new MCPToolset(
    {
      type: 'StreamableHTTPConnectionParams',
      url: `http://127.0.0.1:${address.port}/mcp/projects/${projectId}`,
      transportOptions: {
        requestInit: {
          headers: { 'x-lablineage-mcp-token': getMcpInternalToken() }
        }
      }
    },
    ['mcp_lineage_evidence', 'mcp_repository_evidence'],
    'mcp'
  );
  try {
    const tools = await toolset.getTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      'mcp_lineage_evidence',
      'mcp_repository_evidence'
    ]);
    assert.equal(tools.some((tool) => /write|delete|send|permission/i.test(tool.name)), false);
    const lineage = tools.find((tool) => tool.name === 'mcp_lineage_evidence');
    const result = await lineage.runAsync({
      args: { artifact: 'fig3.png' },
      toolContext: { abortSignal: undefined }
    });
    const text = result.content.find((item) => item.type === 'text')?.text;
    assert.match(text, /figure_3/);
    assert.match(text, /ev_figure_hash/);
    assert.doesNotMatch(text, /C:\\\\Users|GOOGLE_GENAI_API_KEY|Authorization/i);
  } finally {
    await toolset.close();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
