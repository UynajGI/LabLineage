export type ClientAuthConfig = {
  mode: string;
  enabled: boolean;
  issuer?: string;
  clientId?: string;
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  redirectUri?: string;
  scope?: string;
};

const TOKEN_KEY = 'lablineage.oidc.token';
const VERIFIER_KEY = 'lablineage.oidc.verifier';
const STATE_KEY = 'lablineage.oidc.state';
let configRequest: Promise<ClientAuthConfig> | null = null;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function randomValue(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}

function redirectUri(config: ClientAuthConfig): string {
  return config.redirectUri || `${window.location.origin}${window.location.pathname}`;
}

export async function getClientAuthConfig(): Promise<ClientAuthConfig> {
  configRequest ||= fetch('/api/client-config')
    .then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load authentication configuration (${response.status})`);
      return response.json() as Promise<ClientAuthConfig>;
    })
    .catch((error) => {
      configRequest = null;
      throw error;
    });
  return configRequest;
}

export function getAccessToken(): string | null {
  const raw = sessionStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    const token = JSON.parse(raw) as { accessToken: string; expiresAt: number };
    if (!token.accessToken || token.expiresAt <= Date.now() + 30_000) {
      sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return token.accessToken;
  } catch {
    sessionStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

export async function completeLoginIfPresent(config: ClientAuthConfig): Promise<boolean> {
  if (!config.enabled) return false;
  const query = new URLSearchParams(window.location.search);
  const code = query.get('code');
  const returnedState = query.get('state');
  if (!code) return Boolean(getAccessToken());
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!returnedState || returnedState !== expectedState || !verifier) {
    throw new Error('OIDC callback state verification failed');
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId!,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri(config)
  });
  const response = await fetch(config.tokenEndpoint!, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  });
  const token = await response.json().catch(() => ({}));
  if (!response.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || `OIDC token exchange failed (${response.status})`);
  }
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify({
    accessToken: token.access_token,
    expiresAt: Date.now() + Number(token.expires_in || 300) * 1000
  }));
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash || '#/'}`);
  return true;
}

export async function beginLogin(config: ClientAuthConfig): Promise<void> {
  if (!config.enabled || !config.authorizationEndpoint || !config.clientId) {
    throw new Error('OIDC PKCE login is not configured');
  }
  const verifier = randomValue(48);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const state = randomValue();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const target = new URL(config.authorizationEndpoint);
  target.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri(config),
    response_type: 'code',
    scope: config.scope || 'openid profile email',
    state,
    code_challenge: base64Url(new Uint8Array(digest)),
    code_challenge_method: 'S256'
  }).toString();
  window.location.assign(target);
}

export function logout(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  window.location.reload();
}
