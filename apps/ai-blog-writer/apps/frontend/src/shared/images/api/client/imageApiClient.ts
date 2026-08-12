import { API_BASE_URL as API_URL } from '../../../api/client/config';

export { API_URL };

export async function postFormData(
  path: string,
  formData: FormData,
  token?: string,
  signal?: AbortSignal,
): Promise<Response> {
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: formData,
    signal,
  });
}

export async function postJson<TBody extends Record<string, unknown>>(
  path: string,
  body: TBody,
  token?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}
