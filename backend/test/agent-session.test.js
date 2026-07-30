import assert from 'node:assert/strict';
import test from 'node:test';
import { GuardianSessionService } from '../lib/agent-session-service.js';
import { makeDemoState } from '../lib/store.js';

function memoryStore() {
  return {
    state: makeDemoState(),
    get() {
      return this.state;
    },
    async update(mutator) {
      return mutator(this.state);
    }
  };
}

test('Guardian sessions persist events within project, actor and conversation boundaries', async () => {
  const store = memoryStore();
  const projectId = store.get().projects[0].id;
  const sessions = new GuardianSessionService(store, projectId);
  const created = await sessions.createConversation('actor-a', 'Evidence review');
  const session = await sessions.getSession({
    appName: sessions.appName,
    userId: 'actor-a',
    sessionId: created.id
  });
  assert.ok(session);
  await sessions.appendEvent({
    session,
    event: {
      id: 'event-1',
      author: 'EvidenceRetrieverAgent',
      timestamp: Date.now() / 1000,
      actions: { stateDelta: { lastRoute: 'evidence' } },
      content: { role: 'model', parts: [{ text: 'Evidence response' }] }
    }
  });

  const restored = await sessions.getSession({
    appName: sessions.appName,
    userId: 'actor-a',
    sessionId: created.id
  });
  assert.equal(restored.events.length, 1);
  assert.equal(restored.events[0].author, 'EvidenceRetrieverAgent');
  assert.equal(restored.state.lastRoute, 'evidence');

  const otherActor = await sessions.getSession({
    appName: sessions.appName,
    userId: 'actor-b',
    sessionId: created.id
  });
  assert.equal(otherActor, undefined);
  assert.equal((await sessions.listConversations('actor-a')).length, 1);
  assert.equal((await sessions.listConversations('actor-b')).length, 0);

  await sessions.deleteSession({
    appName: sessions.appName,
    userId: 'actor-a',
    sessionId: created.id
  });
  assert.equal((await sessions.listConversations('actor-a')).length, 0);
});

test('Guardian session service rejects cross-project app names', async () => {
  const store = memoryStore();
  const sessions = new GuardianSessionService(store, store.get().projects[0].id);
  await assert.rejects(
    sessions.createSession({
      appName: 'lablineage_guardian:another-project',
      userId: 'actor-a',
      sessionId: 'conversation-123'
    }),
    /project boundary mismatch/
  );
});
