import { PAYLOAD_API_URL } from '../../../shared/api/client/config'
import { payloadMutation, payloadRequest } from '../../../shared/api/client/http'
import type { AvatarAsset, EmailLog, StaffUser, StaffUserPatch } from '../types'

export async function fetchStaffUser(id: number | string, token: string): Promise<StaffUser> {
  // depth=1 populates the avatar upload relationship for preview
  return payloadRequest(`/api/users/${id}?depth=1`, token)
}

export async function updateStaffUser(
  id: number | string,
  patch: StaffUserPatch,
  token: string,
): Promise<StaffUser> {
  const response = (await payloadMutation(`/api/users/${id}`, 'PATCH', patch, token)) as {
    doc?: StaffUser
  }
  if (!response.doc) {
    throw new Error('Payload returned no updated user document.')
  }
  return response.doc
}

/**
 * Direct MediaAsset upload for profile avatars. Questura's domain rules
 * explicitly reserve direct media-asset uploads for internal profile images,
 * so this does not go through the MediaSet workflow.
 */
export async function uploadAvatarAsset(file: File, token: string): Promise<AvatarAsset> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('_payload', JSON.stringify({ alt_text: 'Author profile avatar' }))

  const response = await fetch(`${PAYLOAD_API_URL}/api/media-assets`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Avatar upload failed: ${response.status}${text ? ` — ${text}` : ''}`)
  }

  const data = (await response.json()) as { doc?: AvatarAsset }
  if (!data.doc?.id) {
    throw new Error('Avatar upload returned no media asset document.')
  }
  return data.doc
}

export async function fetchStaffUsers(token: string): Promise<StaffUser[]> {
  const response = (await payloadRequest('/api/users?limit=200&sort=email&depth=0', token)) as {
    docs?: StaffUser[]
  }
  return response.docs ?? []
}

/**
 * Invite-style onboarding (ADR-0023): the account is created with a random
 * password that is never shown to anyone; the new hire sets their own via the
 * password-set email. Only `writer` and `editor` can be created from ABW.
 */
export async function createStaffUser(
  input: { email: string; firstName: string; lastName: string; role: 'writer' | 'editor' },
  token: string,
): Promise<StaffUser> {
  const response = (await payloadMutation(
    '/api/users',
    'POST',
    { ...input, password: generateDiscardedPassword() },
    token,
  )) as { doc?: StaffUser }
  if (!response.doc) {
    throw new Error('Payload returned no created user document.')
  }
  return response.doc
}

/**
 * Triggers Payload's forgot-password email so the hire sets their password.
 * Also the "resend invite" primitive: safe to call again when the first email
 * went to a mailbox that didn't exist yet.
 */
export async function requestPasswordSetEmail(email: string): Promise<void> {
  await payloadMutation('/api/users/forgot-password', 'POST', { email })
}

/**
 * Recent transactional-email delivery log (admin-only on the server). Rows are
 * written by questura's email tracking; an empty result may just mean tracking
 * is disabled (EMAIL_TRACKING=false).
 */
export async function fetchEmailLogs(token: string, limit = 50): Promise<EmailLog[]> {
  const response = (await payloadRequest(
    `/api/email-logs?limit=${limit}&sort=-createdAt&depth=0`,
    token,
  )) as { docs?: EmailLog[] }
  return response.docs ?? []
}

/** The only legal role change: admin promotes a writer to editor. */
export async function promoteWriterToEditor(
  id: number | string,
  token: string,
): Promise<StaffUser> {
  const response = (await payloadMutation(`/api/users/${id}`, 'PATCH', { role: 'editor' }, token)) as {
    doc?: StaffUser
  }
  if (!response.doc) {
    throw new Error('Payload returned no updated user document.')
  }
  return response.doc
}

function generateDiscardedPassword(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function avatarUrl(avatar: AvatarAsset | number | null | undefined): string | null {
  if (!avatar || typeof avatar === 'number') return null
  if (avatar.url) return avatar.url
  if (avatar.filename) return `${PAYLOAD_API_URL}/api/media-assets/file/${avatar.filename}`
  return null
}
