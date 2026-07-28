import { createHash, randomUUID } from 'node:crypto';

const RETENTION_MS = 24 * 60 * 60 * 1000;
const IN_PROGRESS_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_RECORDS = 50_000;

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function requestFingerprint(req) {
  return createHash('sha256')
    .update(canonicalJson({
      method: req.method,
      path: req.originalUrl,
      body: req.body ?? null,
    }))
    .digest('hex');
}

function sendReplay(res, record) {
  res.set('Idempotency-Replayed', 'true');
  res.status(record.responseStatus);
  if (record.responseKind === 'end') return res.end();
  if (record.responseKind === 'send') return res.send(record.responseBody);
  return res.json(record.responseBody);
}

/**
 * Durable idempotency middleware for authenticated state-changing routes.
 *
 * Place this after route authorization so unauthorized requests cannot reserve
 * keys. A body `idempotencyKey` is accepted for the Workspace compatibility
 * contract and promoted to the standard header for downstream handlers.
 */
export function createIdempotencyMiddleware(store) {
  return async function idempotentWrite(req, res, next) {
    const suppliedKey = req.get('idempotency-key') || req.body?.idempotencyKey;
    if (typeof suppliedKey !== 'string' || suppliedKey.length < 8 || suppliedKey.length > 200 || /[\u0000-\u001f\u007f]/u.test(suppliedKey)) {
      return res.status(400).json({ error: 'A valid Idempotency-Key header is required' });
    }
    if (!req.get('idempotency-key')) req.headers['idempotency-key'] = suppliedKey;

    const actor = req.actor?.subject || 'unknown';
    const requestPath = req.originalUrl.split('?')[0];
    const requestSha256 = requestFingerprint(req);
    const now = Date.now();
    let decision;

    await store.update((state) => {
      state.idempotencyRecords ||= [];
      state.idempotencyRecords = state.idempotencyRecords
        .filter((record) => Date.parse(record.expiresAt) > now)
        .slice(-MAX_RECORDS);
      const existing = state.idempotencyRecords.find((record) => (
        record.actor === actor
        && record.method === req.method
        && record.requestPath === requestPath
        && record.idempotencyKey === suppliedKey
      ));
      if (existing) {
        if (existing.requestSha256 !== requestSha256) {
          decision = { kind: 'conflict' };
        } else if (existing.status === 'completed') {
          decision = { kind: 'replay', record: structuredClone(existing) };
        } else if (Date.parse(existing.createdAt) + IN_PROGRESS_TIMEOUT_MS > now) {
          decision = { kind: 'in_progress' };
        } else {
          existing.status = 'in_progress';
          existing.createdAt = new Date(now).toISOString();
          existing.expiresAt = new Date(now + RETENTION_MS).toISOString();
          decision = { kind: 'claimed', id: existing.id };
        }
        return;
      }

      const record = {
        id: `idem_${randomUUID()}`,
        actor,
        method: req.method,
        requestPath,
        idempotencyKey: suppliedKey,
        requestSha256,
        status: 'in_progress',
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + RETENTION_MS).toISOString(),
      };
      state.idempotencyRecords.push(record);
      decision = { kind: 'claimed', id: record.id };
    });

    if (decision.kind === 'conflict') {
      return res.status(409).json({ error: 'Idempotency-Key was already used with a different request' });
    }
    if (decision.kind === 'in_progress') {
      res.set('Retry-After', '1');
      return res.status(409).json({ error: 'A request with this Idempotency-Key is still in progress' });
    }
    if (decision.kind === 'replay') return sendReplay(res, decision.record);

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    const originalEnd = res.end.bind(res);
    let finalizing = false;
    let finalized = false;

    const finalize = async (responseKind, responseBody) => {
      if (finalizing) return res;
      finalizing = true;
      const responseStatus = res.statusCode;
      await store.update((state) => {
        state.idempotencyRecords ||= [];
        const index = state.idempotencyRecords.findIndex((record) => record.id === decision.id);
        if (index < 0) throw new Error('Idempotency claim disappeared before completion');
        if (responseStatus >= 500) {
          state.idempotencyRecords.splice(index, 1);
          return;
        }
        Object.assign(state.idempotencyRecords[index], {
          status: 'completed',
          responseStatus,
          responseKind,
          responseBody: responseBody ?? null,
          completedAt: new Date().toISOString(),
        });
      });
      finalized = true;
      res.json = originalJson;
      res.send = originalSend;
      res.end = originalEnd;
      res.set('Idempotency-Key', suppliedKey);
      if (responseKind === 'end') return originalEnd();
      if (responseKind === 'send') return originalSend(responseBody);
      return originalJson(responseBody);
    };

    res.json = (body) => {
      void finalize('json', body).catch(next);
      return res;
    };
    res.send = (body) => {
      void finalize('send', body).catch(next);
      return res;
    };
    res.end = () => {
      void finalize('end', null).catch(next);
      return res;
    };
    res.once('close', () => {
      if (finalized || finalizing) return;
      void store.update((state) => {
        state.idempotencyRecords ||= [];
        state.idempotencyRecords = state.idempotencyRecords.filter((record) => record.id !== decision.id);
      }).catch(() => {});
    });
    next();
  };
}
