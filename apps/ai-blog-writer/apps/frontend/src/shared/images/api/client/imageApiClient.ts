import { API_BASE_URL as API_URL } from '../../../api/client/config';
import { apiFetch } from '../../../api/client/apiFetch';

export { API_URL };

/**
 * Requests to the AI Blog Writer backend's image routes.
 *
 * These used to take the caller's Payload JWT and send it as
 * `Authorization: Bearer`, because the backend forwards it to Payload so that
 * uploads are created as the acting Staff user. The backend now takes that same
 * JWT from the httpOnly `payload-token` cookie instead, which `apiFetch` sends
 * on every request — so there is nothing for a caller to hold or pass.
 */

export async function postFormData(
  path: string,
  formData: FormData,
  signal?: AbortSignal,
): Promise<Response> {
  return apiFetch(path, {
    method: 'POST',
    body: formData,
    signal,
  });
}

export async function postJson<TBody extends Record<string, unknown>>(
  path: string,
  body: TBody,
): Promise<Response> {
  return apiFetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
}
