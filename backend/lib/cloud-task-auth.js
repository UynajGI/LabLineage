import { OAuth2Client } from 'google-auth-library';

function bearerToken(header = '') {
  return /^Bearer\s+(.+)$/iu.exec(header)?.[1] || null;
}

export function authenticateCloudTask({ verifier = new OAuth2Client() } = {}) {
  return async (req, res, next) => {
    try {
      const audience = process.env.LABLINEAGE_TASKS_AUDIENCE;
      const expectedEmail = process.env.LABLINEAGE_TASKS_SERVICE_ACCOUNT;
      const token = bearerToken(req.get('authorization'));
      if (!token || !audience || !expectedEmail) return res.status(401).json({ error: 'Cloud Tasks OIDC authentication required' });
      const ticket = await verifier.verifyIdToken({ idToken: token, audience });
      const payload = ticket.getPayload();
      if (!payload?.email_verified || payload.email !== expectedEmail) {
        return res.status(403).json({ error: 'Cloud Tasks service account is not authorized' });
      }
      req.cloudTask = { subject: payload.sub, email: payload.email };
      next();
    } catch {
      res.status(401).json({ error: 'Cloud Tasks OIDC authentication failed' });
    }
  };
}
