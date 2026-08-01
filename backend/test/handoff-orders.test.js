import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { app, store } from '../server.js';
import { makeDemoState } from '../lib/store.js';
import {
  HandoffStateError,
  HandoffVersionConflictError,
  assertTransition,
  assertVersion,
  canComplete,
  computeOverdue,
  nextOrderNumber
} from '../lib/handoff-orders.js';

async function withServer(run) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

async function withIsolatedStore(run) {
  const previousMode = process.env.LABLINEAGE_AUTH_MODE;
  const originalDataDir = store.dataDir;
  const originalState = structuredClone(store.get());
  const testDataDir = await mkdtemp(path.join(tmpdir(), 'lablineage-handoff-orders-'));
  store.dataDir = testDataDir;
  process.env.LABLINEAGE_AUTH_MODE = 'development';
  const fresh = makeDemoState();
  await store.update((state) => {
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, fresh);
  });
  try {
    await run();
  } finally {
    store.dataDir = originalDataDir;
    process.env.LABLINEAGE_AUTH_MODE = previousMode;
    await store.update((state) => {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, originalState);
    });
    await rm(testDataDir, { recursive: true, force: true });
  }
}

const ORDER_BODY = {
  departingSubject: 'departing-member',
  departingEmailSnapshot: 'departing@example.edu',
  receivingSubject: 'local-developer',
  receivingEmailSnapshot: 'receiver@example.edu',
  reviewerSubject: 'local-developer',
  reviewerEmailSnapshot: 'reviewer@example.edu',
  dueAt: new Date(Date.now() + 86_400_000).toISOString(),
  dueTimezone: 'Asia/Shanghai',
  tasks: []
};

function uuid() {
  return randomUUID();
}

test('handoff order state machine helpers enforce transitions and versions', () => {
  assert.match(nextOrderNumber([]), /^HO-\d{6}-001$/u);
  assert.equal(nextOrderNumber([{ orderNumber: 'HO-202608-001' }, { orderNumber: 'HO-202608-007' }]), 'HO-202608-008');
  assert.equal(nextOrderNumber([{ orderNumber: 'HO-202608-009' }], new Date('2026-09-01T00:00:00Z')), 'HO-202609-001');

  assert.ok(computeOverdue({ status: 'approved', dueAt: new Date(Date.now() - 1000).toISOString() }));
  assert.equal(computeOverdue({ status: 'completed', dueAt: new Date(Date.now() - 1000).toISOString() }), false);
  assert.equal(computeOverdue({ status: 'draft', dueAt: null }), false);

  assert.doesNotThrow(() => assertTransition({ status: 'draft' }, 'submitted'));
  assert.throws(() => assertTransition({ status: 'draft' }, 'completed'), HandoffStateError);
  assert.throws(() => assertVersion({ version: 2 }, 1), HandoffVersionConflictError);

  const order = { status: 'receiver_accepted' };
  assert.equal(canComplete(order, [{ decision: 'approved' }], []), true);
  assert.equal(canComplete(order, [{ decision: 'approved' }], [{ status: 'pending' }]), false);
  assert.equal(canComplete(order, [{ decision: 'changes_requested' }], []), false);
  assert.equal(canComplete({ status: 'approved' }, [{ decision: 'approved' }], []), false);
});

test('handoff order lifecycle over HTTP with versioning, reviews and events', async () => {
  await withIsolatedStore(async () => {
    await withServer(async (baseUrl) => {
      const headers = { 'content-type': 'application/json', 'x-lablineage-role': 'editor' };
      const create = async (body = ORDER_BODY, key = uuid()) => {
        const response = await fetch(`${baseUrl}/v1/projects/project_phase_transition/handoffs`, {
          method: 'POST', headers: { ...headers, 'Idempotency-Key': key }, body: JSON.stringify(body)
        });
        return { response, json: await response.json() };
      };

      const created = await create();
      assert.equal(created.response.status, 201);
      assert.equal(created.json.status, 'draft');
      assert.equal(created.json.version, 1);
      assert.ok(created.json.orderNumber.startsWith('HO-'));
      assert.equal(created.json.tasks.length, 0);
      const orderId = created.json.id;

      // duplicate idempotency key does not create a second order
      const duplicate = await create(ORDER_BODY, 'fixed-key');
      const duplicateAgain = await create(ORDER_BODY, 'fixed-key');
      assert.equal(duplicateAgain.response.status, 201);
      assert.equal(duplicateAgain.json.id, duplicate.json.id);

      const list = await fetch(`${baseUrl}/v1/projects/project_phase_transition/handoffs`, { headers });
      assert.equal(list.status, 200);
      const listBody = await list.json();
      assert.equal(listBody.orders.length, 2);
      assert.ok(listBody.orders.every((order) => order.overdue === false));

      // stale version patch is rejected
      const stalePatch = await fetch(`${baseUrl}/v1/handoffs/${orderId}`, {
        method: 'PATCH', headers: { ...headers, 'Idempotency-Key': uuid() },
        body: JSON.stringify({ expectedVersion: 99, dueTimezone: 'UTC' })
      });
      assert.equal(stalePatch.status, 409);

      const patch = await fetch(`${baseUrl}/v1/handoffs/${orderId}`, {
        method: 'PATCH', headers: { ...headers, 'Idempotency-Key': uuid() },
        body: JSON.stringify({ expectedVersion: 1, dueTimezone: 'UTC' })
      });
      assert.equal(patch.status, 200);
      assert.equal((await patch.json()).version, 2);

      // submit
      const submit = await fetch(`${baseUrl}/v1/handoffs/${orderId}/submit`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': uuid() }, body: JSON.stringify({ expectedVersion: 2 })
      });
      assert.equal(submit.status, 200);
      assert.equal((await submit.json()).status, 'submitted');

      // patch after submit is rejected (not editable)
      const latePatch = await fetch(`${baseUrl}/v1/handoffs/${orderId}`, {
        method: 'PATCH', headers: { ...headers, 'Idempotency-Key': uuid() },
        body: JSON.stringify({ expectedVersion: 3 })
      });
      assert.equal(latePatch.status, 409);

      // review by a non-reviewer is rejected
      const otherReview = await fetch(`${baseUrl}/v1/handoffs/${orderId}/reviews`, {
        method: 'POST', headers: { ...headers, 'x-lablineage-user': 'someone-else', 'Idempotency-Key': uuid() },
        body: JSON.stringify({ expectedVersion: 3, decision: 'approved', comment: 'fine' })
      });
      assert.equal(otherReview.status, 409);

      // reviewer approves
      const review = await fetch(`${baseUrl}/v1/handoffs/${orderId}/reviews`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': uuid() }, body: JSON.stringify({ expectedVersion: 3, decision: 'approved', comment: '符合交接要求' })
      });
      assert.equal(review.status, 200);
      const reviewed = await review.json();
      assert.equal(reviewed.status, 'approved');
      assert.equal(reviewed.reviews.length, 1);
      assert.equal(reviewed.reviews[0].decision, 'approved');

      // accept by a non-receiver is rejected (departing member cannot accept)
      const wrongAccept = await fetch(`${baseUrl}/v1/handoffs/${orderId}/accept`, {
        method: 'POST', headers: { ...headers, 'x-lablineage-user': 'departing-member', 'Idempotency-Key': uuid() },
        body: JSON.stringify({ expectedVersion: 4 })
      });
      assert.equal(wrongAccept.status, 409);

      // receiver accepts
      const accept = await fetch(`${baseUrl}/v1/handoffs/${orderId}/accept`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': uuid() }, body: JSON.stringify({ expectedVersion: 4 })
      });
      assert.equal(accept.status, 200);
      assert.equal((await accept.json()).status, 'receiver_accepted');

      // complete
      const complete = await fetch(`${baseUrl}/v1/handoffs/${orderId}/complete`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': uuid() }, body: JSON.stringify({ expectedVersion: 5 })
      });
      assert.equal(complete.status, 200);
      assert.equal((await complete.json()).status, 'completed');

      // append-only event timeline
      const events = await fetch(`${baseUrl}/v1/handoffs/${orderId}/events`, { headers });
      assert.equal(events.status, 200);
      const timeline = await events.json();
      const types = timeline.events.map((event) => event.eventType);
      assert.deepEqual(types, ['created', 'updated', 'submitted', 'in_review', 'approved', 'receiver_accepted', 'completed']);

      // a pending task deterministically blocks completion
      const gated = await create({ ...ORDER_BODY, tasks: [{ title: '迁移 Git 仓库', description: 'push 所有分支' }] });
      const gatedId = gated.json.id;
      const gatedTaskId = gated.json.tasks[0].id;
      await fetch(`${baseUrl}/v1/handoffs/${gatedId}/submit`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': uuid() }, body: JSON.stringify({ expectedVersion: 1 })
      });
      await fetch(`${baseUrl}/v1/handoffs/${gatedId}/reviews`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': uuid() }, body: JSON.stringify({ expectedVersion: 2, decision: 'approved', comment: 'ok' })
      });
      await fetch(`${baseUrl}/v1/handoffs/${gatedId}/accept`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': uuid() }, body: JSON.stringify({ expectedVersion: 3 })
      });
      const gatedComplete = await fetch(`${baseUrl}/v1/handoffs/${gatedId}/complete`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': uuid() }, body: JSON.stringify({ expectedVersion: 4 })
      });
      assert.equal(gatedComplete.status, 409);
      const taskDone = await fetch(`${baseUrl}/v1/handoffs/${gatedId}/tasks/${gatedTaskId}/status`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': uuid() }, body: JSON.stringify({ expectedVersion: 4, status: 'done' })
      });
      assert.equal(taskDone.status, 200);
      const gatedCompleteAfter = await fetch(`${baseUrl}/v1/handoffs/${gatedId}/complete`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': uuid() }, body: JSON.stringify({ expectedVersion: 5 })
      });
      assert.equal(gatedCompleteAfter.status, 200);
      assert.equal((await gatedCompleteAfter.json()).status, 'completed');

      // worksp ace export is rejected when there is no preview binding
      const executeBeforePreview = await fetch(`${baseUrl}/v1/handoffs/${orderId}/exports/execute`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': uuid() },
        body: JSON.stringify({
          expectedVersion: 6,
          previewSha256: '0'.repeat(64),
          confirmation: 'EXPORT_TO_GOOGLE_WORKSPACE'
        })
      });
      assert.equal(executeBeforePreview.status, 409);

      // preview is bound to the order
      const preview = await fetch(`${baseUrl}/v1/handoffs/${orderId}/exports/preview`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': uuid() }, body: JSON.stringify({ expectedVersion: 6 })
      });
      assert.equal(preview.status, 200);
      const previewBody = await preview.json();
      assert.equal(previewBody.preview.orderId, orderId);
      assert.match(previewBody.sha256, /^[a-f0-9]{64}$/u);

      // cancel is rejected after completion
      const cancel = await fetch(`${baseUrl}/v1/handoffs/${orderId}/cancel`, {
        method: 'POST', headers: { ...headers, 'Idempotency-Key': uuid() }, body: JSON.stringify({ expectedVersion: 6 })
      });
      assert.equal(cancel.status, 409);
    });
  });
});

test('system setup rejects event-level fields and unknown regions', async () => {
  await withIsolatedStore(async () => {
    await withServer(async (baseUrl) => {
      const admin = { 'content-type': 'application/json', 'x-lablineage-role': 'admin' };
      const base = {
        institutionName: '示例大学',
        labName: '复杂系统实验室',
        adminDisplayName: '实验室管理员',
        adminEmail: 'admin@example.edu',
        dataResidency: 'local',
        defaultRegion: 'asia-east1',
        defaultTimezone: 'Asia/Shanghai',
        notificationLanguage: 'zh-CN',
        defaultProjectName: '相变研究',
        defaultProjectSlug: 'phase-transition'
      };

      const ok = await fetch(`${baseUrl}/v1/setup`, {
        method: 'PUT', headers: { ...admin, 'Idempotency-Key': uuid() }, body: JSON.stringify(base)
      });
      assert.equal(ok.status, 204);

      const badRegion = await fetch(`${baseUrl}/v1/setup`, {
        method: 'PUT', headers: { ...admin, 'Idempotency-Key': uuid() },
        body: JSON.stringify({ ...base, defaultRegion: 'asia-eastl' })
      });
      assert.equal(badRegion.status, 400);

      const withEventFields = await fetch(`${baseUrl}/v1/setup`, {
        method: 'PUT', headers: { ...admin, 'Idempotency-Key': uuid() },
        body: JSON.stringify({ ...base, departingMemberEmail: 'departing@example.edu' })
      });
      assert.equal(withEventFields.status, 400);
    });
  });
});
