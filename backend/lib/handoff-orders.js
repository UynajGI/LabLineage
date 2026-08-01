/**
 * HandoffOrder domain core: state machine, order numbers, overdue derivation,
 * version control, and deterministic completion checks.
 *
 * Model invariants:
 * - `overdue` is derived from due_at, never a manually storable status.
 * - Workspace export task states (in_progress/failed) are NOT order statuses.
 * - Reviews must be performed by the assigned reviewer's auth subject.
 * - Completion is decided by deterministic services, never by the Agent.
 */

export const HANDOFF_ORDER_STATUSES = Object.freeze([
  'draft', 'submitted', 'in_review', 'changes_requested',
  'approved', 'receiver_accepted', 'completed', 'cancelled'
]);

/** States that are still "open" and can therefore be overdue. */
export const OPEN_STATUSES = Object.freeze([
  'draft', 'submitted', 'in_review', 'changes_requested', 'approved', 'receiver_accepted'
]);

/** Allowed target statuses per current status. */
export const HANDOFF_TRANSITIONS = Object.freeze({
  draft: Object.freeze(['submitted', 'cancelled']),
  submitted: Object.freeze(['in_review', 'cancelled']),
  in_review: Object.freeze(['approved', 'changes_requested', 'cancelled']),
  changes_requested: Object.freeze(['submitted', 'cancelled']),
  approved: Object.freeze(['receiver_accepted', 'cancelled']),
  receiver_accepted: Object.freeze(['completed']),
  completed: Object.freeze([]),
  cancelled: Object.freeze([])
});

export class HandoffStateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HandoffStateError';
  }
}

export class HandoffVersionConflictError extends Error {
  constructor(expected, actual) {
    super(`Handoff order version conflict: expected ${expected}, actual ${actual}`);
    this.name = 'HandoffVersionConflictError';
  }
}

/** Generate the next order number for the given month, e.g. HO-202608-001. */
export function nextOrderNumber(orders, now = new Date()) {
  const prefix = `HO-${String(now.getUTCFullYear())}${String(now.getUTCMonth() + 1).padStart(2, '0')}-`;
  let maxSequence = 0;
  for (const order of orders) {
    if (!order.orderNumber.startsWith(prefix)) continue;
    const sequence = Number(order.orderNumber.slice(prefix.length));
    if (Number.isInteger(sequence) && sequence > maxSequence) maxSequence = sequence;
  }
  return `${prefix}${String(maxSequence + 1).padStart(3, '0')}`;
}

/** Overdue is derived dynamically for open orders with an elapsed due date. */
export function computeOverdue(order, now = new Date()) {
  if (!OPEN_STATUSES.includes(order.status)) return false;
  if (!order.dueAt) return false;
  return new Date(order.dueAt).getTime() < now.getTime();
}

/** Throws unless `status → target` is a legal transition. */
export function assertTransition(order, target) {
  const allowed = HANDOFF_TRANSITIONS[order.status] || [];
  if (!allowed.includes(target)) {
    throw new HandoffStateError(`Illegal handoff transition: ${order.status} -> ${target}`);
  }
}

/** Throws unless the expected version matches the current version. */
export function assertVersion(order, expectedVersion) {
  if (order.version !== expectedVersion) {
    throw new HandoffVersionConflictError(expectedVersion, order.version);
  }
}

/** Editable fields are allowed only in draft / changes_requested. */
export function assertEditable(order) {
  if (order.status !== 'draft' && order.status !== 'changes_requested') {
    throw new HandoffStateError(`Handoff order is not editable in status ${order.status}`);
  }
}

/** A review may only be recorded by the assigned reviewer's auth subject. */
export function assertReviewer(order, subject) {
  if (order.reviewerSubject !== subject) {
    throw new HandoffStateError(`Only the assigned reviewer ${order.reviewerSubject} may review this order`);
  }
}

/** Receiver acceptance may only be recorded by the receiving member's auth subject. */
export function assertReceiver(order, subject) {
  if (order.receivingSubject !== subject) {
    throw new HandoffStateError(`Only the receiving member ${order.receivingSubject} may accept this order`);
  }
}

/**
 * Deterministic completion: receiver accepted, an approving review exists,
 * and every required task is done.
 */
export function canComplete(order, reviews, tasks) {
  if (order.status !== 'receiver_accepted') return false;
  if (!reviews.some((review) => review.decision === 'approved')) return false;
  return tasks.every((task) => task.status === 'done');
}
