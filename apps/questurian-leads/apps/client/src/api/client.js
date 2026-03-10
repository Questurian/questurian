const DEFAULT_API_BASE = import.meta.env.DEV ? '/api' : 'http://localhost:4004';

export const API_BASE = import.meta.env.VITE_API_BASE || DEFAULT_API_BASE;

export async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  let response;

  try {
    response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
  } catch (error) {
    const err = new Error(`Unable to reach the API at ${API_BASE}`);
    err.status = 0;
    err.code = 'NETWORK_ERROR';
    err.apiBase = API_BASE;
    err.endpoint = endpoint;
    err.url = url;
    err.causeMessage = error?.message || 'Network request failed';
    throw err;
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || '';
    let detail = 'An error occurred';

    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => null);
      detail = payload?.detail || payload?.message || detail;
    } else {
      const text = await response.text().catch(() => '');
      if (text.trim()) {
        detail = text;
      }
    }

    const err = new Error(detail || `Request failed with status ${response.status}`);
    err.status = response.status;
    err.apiBase = API_BASE;
    err.endpoint = endpoint;
    err.url = url;

    const tableMatch = detail.match(/no such table: ([a-zA-Z0-9_]+)/i);
    if (tableMatch) {
      err.code = 'MISSING_TABLE';
      err.missingTable = tableMatch[1];
    } else if (response.status === 404) {
      err.code = 'NOT_FOUND';
    } else if (response.status >= 500) {
      err.code = 'SERVER_ERROR';
    } else {
      err.code = 'HTTP_ERROR';
    }

    throw err;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}
