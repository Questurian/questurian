export const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4003';

export async function postFormData(
  path: string,
  formData: FormData,
  token?: string
): Promise<Response> {
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });
}
