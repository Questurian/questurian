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
    credentials: 'omit',
    headers,
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch from ${endpoint}: ${response.status}`)
  }

  return response.json()
}
