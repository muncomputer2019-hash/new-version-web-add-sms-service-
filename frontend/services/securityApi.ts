import { ApiResponseEnvelope } from '../modules/types';

const AUTH_TOKEN_STORAGE_KEY = 'mun_auth_token_v1';

let inMemoryCsrfToken: string | null = null;
let inMemoryAuthToken: string | null = readStoredAuthToken();

function readStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setCsrfToken(token: string | null) {
  inMemoryCsrfToken = token;
}

export function setAuthToken(token: string | null) {
  inMemoryAuthToken = token;
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failure in restricted contexts
  }
}

export function getAuthToken(): string | null {
  return inMemoryAuthToken || readStoredAuthToken();
}

export function isExpressBackendOffline(): boolean {
  return false;
}

function readCsrfFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)mun_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function resolveApiUrl(path: string): string {
  const configuredBase = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!configuredBase || configuredBase === '/api') {
    return path;
  }
  if (configuredBase.endsWith('/api') && path.startsWith('/api/')) {
    return `${configuredBase}${path.slice(4)}`;
  }
  return `${configuredBase}${path}`;
}

export interface SecurityRequestOptions extends RequestInit {
  timeoutMs?: number;
}

async function performFetchWithTimeout(
  targetUrl: string,
  fetchOptions: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    return await fetch(targetUrl, {
      ...fetchOptions,
      credentials: 'include',
      signal: fetchOptions.signal ?? controller?.signal,
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function securityRequest<T>(
  path: string,
  options: SecurityRequestOptions = {}
): Promise<ApiResponseEnvelope<T>> {
  const { timeoutMs: overrideTimeoutMs, ...fetchOptions } = options;
  const method = (fetchOptions.method || 'GET').toUpperCase();
  const csrf = inMemoryCsrfToken || readCsrfFromCookie();
  const authToken = getAuthToken();
  const targetUrl = resolveApiUrl(path);
  const timeoutMs =
    overrideTimeoutMs ??
    (path === '/api/auth/me'
      ? Number(import.meta.env.VITE_AUTH_PROBE_TIMEOUT_MS || 4000)
      : Number(import.meta.env.VITE_API_TIMEOUT_MS || 15000));

  const requestInit: RequestInit = {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(csrf && method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}),
      ...fetchOptions.headers,
    },
  };

  let response: Response;
  try {
    response = await performFetchWithTimeout(targetUrl, requestInit, timeoutMs);
    const ct = (response.headers.get('content-type') || '').toLowerCase();
    const isTransientProxyHtml =
      (response.status === 200 && ct.includes('text/html')) ||
      ((response.status === 502 || response.status === 503 || response.status === 504) &&
        !ct.includes('application/json'));
    if (isTransientProxyHtml && !fetchOptions.signal?.aborted) {
      await new Promise((r) => setTimeout(r, 700));
      response = await performFetchWithTimeout(targetUrl, requestInit, timeoutMs);
    }
  } catch {
    throw new Error('Unable to reach authentication & ERP backend API server. Please retry.');
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const rawText = await response.text();
  const trimmed = rawText.trimStart();
  const looksLikeJson =
    contentType.includes('application/json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[');

  if (!looksLikeJson) {
    if (response.redirected) {
      throw new Error(
        `Session proxy redirected API request (${method} ${path}). Refresh the portal page and retry.`
      );
    }
    if (contentType.includes('text/html') || trimmed.startsWith('<')) {
      throw new Error(
        `API returned HTML instead of JSON (${response.status}) for ${method} ${path}. Refresh the page or verify backend API routing.`
      );
    }
    throw new Error(
      `Unexpected non-JSON response from server (${response.status}) for ${method} ${path}.`
    );
  }

  let payload: ApiResponseEnvelope<T>;
  try {
    payload = JSON.parse(rawText) as ApiResponseEnvelope<T>;
  } catch {
    throw new Error(`Invalid JSON payload from server (${response.status}) for ${method} ${path}.`);
  }

  if (!response.ok || !payload.success) {
    if (
      response.status === 401 &&
      !path.startsWith('/api/auth/login') &&
      !path.startsWith('/api/auth/verify-') &&
      !path.startsWith('/api/auth/me')
    ) {
      setAuthToken(null);
      setCsrfToken(null);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mun:auth-expired', { detail: payload.message }));
      }
    }
    const err = new Error(payload.message || `Request failed (${response.status})`) as Error & {
      status?: number;
      errors?: Record<string, string[]>;
      data?: unknown;
    };
    err.status = response.status;
    err.errors = payload.errors;
    err.data = payload.data;
    throw err;
  }

  return payload;
}
