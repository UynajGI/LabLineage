import { createHash, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const ROLE_RANK = Object.freeze({ viewer: 10, auditor: 20, editor: 30, admin: 40 });

function bearerToken(header = '') {
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] || null;
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function serviceActors() {
  const raw = process.env.LABLINEAGE_SERVICE_TOKENS_JSON;
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('LABLINEAGE_SERVICE_TOKENS_JSON must be an array');
  return parsed;
}

export function serviceActorSummaries() {
  return serviceActors().map((entry) => ({
    id: entry.id || 'collector',
    subject: entry.subject || `service:${entry.id || 'collector'}`,
    roles: entry.roles || ['editor'],
    projects: entry.projects || []
  }));
}

function findServiceActor(token) {
  const digest = createHash('sha256').update(token).digest('hex');
  const entry = serviceActors().find((candidate) => (
    typeof candidate.sha256 === 'string' && constantTimeEqual(candidate.sha256, digest)
  ));
  if (!entry) return null;
  return {
    subject: entry.subject || `service:${entry.id || 'collector'}`,
    email: null,
    roles: entry.roles || ['editor'],
    projects: entry.projects || [],
    kind: 'service'
  };
}

let remoteJwks;
function oidcVerifier() {
  const jwksUrl = process.env.LABLINEAGE_OIDC_JWKS_URL;
  if (!jwksUrl) throw new Error('LABLINEAGE_OIDC_JWKS_URL is required in oidc auth mode');
  remoteJwks ||= createRemoteJWKSet(new URL(jwksUrl));
  return remoteJwks;
}

async function verifyOidc(token) {
  const issuer = process.env.LABLINEAGE_OIDC_ISSUER;
  const audience = process.env.LABLINEAGE_OIDC_AUDIENCE;
  if (!issuer || !audience) {
    throw new Error('LABLINEAGE_OIDC_ISSUER and LABLINEAGE_OIDC_AUDIENCE are required');
  }
  const { payload } = await jwtVerify(token, oidcVerifier(), { issuer, audience });
  const rolesClaim = process.env.LABLINEAGE_OIDC_ROLES_CLAIM || 'roles';
  const projectsClaim = process.env.LABLINEAGE_OIDC_PROJECTS_CLAIM || 'projects';
  return {
    subject: payload.sub,
    email: payload.email || null,
    roles: Array.isArray(payload[rolesClaim]) ? payload[rolesClaim] : ['viewer'],
    projects: Array.isArray(payload[projectsClaim]) ? payload[projectsClaim] : [],
    kind: 'user'
  };
}

export function authMode() {
  return process.env.LABLINEAGE_AUTH_MODE || (process.env.NODE_ENV === 'production' ? 'oidc' : 'development');
}

export function authenticateRequest() {
  return async (req, res, next) => {
    try {
      const mode = authMode();
      if (mode === 'development') {
        req.actor = {
          subject: req.get('x-lablineage-user') || 'local-developer',
          email: null,
          roles: [req.get('x-lablineage-role') || 'admin'],
          projects: ['*'],
          kind: 'development'
        };
        return next();
      }
      if (mode === 'disabled' && process.env.NODE_ENV !== 'production') {
        req.actor = { subject: 'anonymous', email: null, roles: ['viewer'], projects: ['*'], kind: 'anonymous' };
        return next();
      }
      const token = bearerToken(req.get('authorization'));
      if (!token) return res.status(401).json({ error: 'Bearer token required' });
      req.actor = findServiceActor(token) || await verifyOidc(token);
      return next();
    } catch (error) {
      return res.status(401).json({ error: 'Authentication failed', detail: error.message });
    }
  };
}

export function hasRole(actor, requiredRole) {
  const required = ROLE_RANK[requiredRole] ?? Number.POSITIVE_INFINITY;
  return (actor?.roles || []).some((role) => (ROLE_RANK[role] || 0) >= required);
}

export function authorizeProject(requiredRole = 'viewer') {
  return (req, res, next) => {
    const actor = req.actor;
    if (!actor) return res.status(401).json({ error: 'Authentication required' });
    if (!hasRole(actor, requiredRole)) return res.status(403).json({ error: `Role ${requiredRole} required` });
    const projectId = req.params.projectId;
    if (projectId && !actor.projects.includes('*') && !actor.projects.includes(projectId)) {
      return res.status(403).json({ error: 'Project access denied' });
    }
    next();
  };
}

export function authorizeRole(requiredRole) {
  return (req, res, next) => {
    if (!req.actor) return res.status(401).json({ error: 'Authentication required' });
    if (!hasRole(req.actor, requiredRole)) {
      return res.status(403).json({ error: `Role ${requiredRole} required` });
    }
    next();
  };
}
