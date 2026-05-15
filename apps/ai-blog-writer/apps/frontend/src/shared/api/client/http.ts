import { PAYLOAD_API_URL } from './config'

export async function payloadRequest(endpoint: string, token?: string) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${PAYLOAD_API_URL}${endpoint}`, {
    method: 'GET',
    mode: 'cors',
    cache: 'no-store',
    credentials: 'omit',
    headers,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch from ${endpoint}: ${response.status}`)
  }

  return response.json()
}

export async function payloadMutation(
  endpoint: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
  token?: string,
) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${PAYLOAD_API_URL}${endpoint}`, {
    method,
    mode: 'cors',
    credentials: 'omit',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Failed ${method} ${endpoint}: ${response.status}${text ? ` — ${text}` : ''}`)
  }

  return response.json()
}
