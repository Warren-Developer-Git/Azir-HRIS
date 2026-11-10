export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let inMemoryToken: string | null = null;

export function setAccessToken(token: string | null) {
  inMemoryToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryToken;
}

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = path.startsWith('/api') ? path : `/api${path.startsWith('/') ? '' : '/'}${path}`;
  const headers = new Headers(init?.headers);

  if (inMemoryToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/refresh')) {
    // Attempt token refresh
    try {
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setAccessToken(refreshData.accessToken);

        // Retry original request with new token
        headers.set('Authorization', `Bearer ${refreshData.accessToken}`);
        const retryRes = await fetch(url, {
          ...init,
          headers,
          credentials: 'include',
        });

        if (!retryRes.ok) {
          const errData = await retryRes.json().catch(() => ({}));
          throw new ApiError(retryRes.status, errData.message || 'Request failed');
        }

        return retryRes.json() as Promise<T>;
      } else {
        setAccessToken(null);
      }
    } catch {
      setAccessToken(null);
    }
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new ApiError(res.status, errData.message || res.statusText || 'Request failed');
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json() as Promise<T>;
}
