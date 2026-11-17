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

/** Escape HTML-significant characters when interpolating text into HTML templates. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Resolve relative `/storage/...` paths through Next.js `/api/...` proxy. */
export function resolveMediaUrl(src?: string | null): string | undefined {
  if (!src) return undefined;
  if (src.startsWith('/storage/')) {
    return `/api${src}`;
  }
  return src;
}

function buildApiUrl(path: string): string {
  return path.startsWith('/api')
    ? path
    : `/api${path.startsWith('/') ? '' : '/'}${path}`;
}

async function fetchWithAuthRetry(path: string, init?: RequestInit): Promise<Response> {
  const url = buildApiUrl(path);
  const headers = new Headers(init?.headers);

  if (inMemoryToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  if (
    init?.body &&
    !(init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (
    res.status === 401 &&
    !path.includes('/auth/login') &&
    !path.includes('/auth/refresh')
  ) {
    try {
      const refreshRes = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        setAccessToken(refreshData.accessToken);
        headers.set('Authorization', `Bearer ${refreshData.accessToken}`);
        return await fetch(url, {
          ...init,
          headers,
          credentials: 'include',
        });
      }
      setAccessToken(null);
    } catch {
      setAccessToken(null);
    }
  }

  return res;
}

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetchWithAuthRetry(path, init);

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errData.message || res.statusText || 'Request failed',
    );
  }

  if (res.status === 204) {
    return {} as T;
  }

  const text = await res.text();
  if (!text) {
    return null as T;
  }
  return JSON.parse(text) as T;
}

/** Download a tenant-protected storage object with Bearer auth and save locally. */
export async function downloadStorageFile(
  key: string,
  fileName?: string,
): Promise<void> {
  const params = new URLSearchParams({ key });
  if (fileName) {
    params.set('name', fileName);
  }

  const res = await fetchWithAuthRetry(`/storage/download?${params.toString()}`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new ApiError(
      res.status,
      errData.message || res.statusText || 'Failed to download file',
    );
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName || key.split('/').pop() || 'attachment';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
