import { PAYLOAD_API_URL } from '../../../shared/api/client/config'
import { payloadMutation, payloadRequest } from '../../../shared/api/client/http'
import type {
  AssignableStaffRole,
  Author,
  AuthorPatch,
  AvatarAsset,
  EmailLog,
  StaffStatus,
  StaffUser,
  StaffUserPatch,
} from '../types'

export async function fetchStaffUser(id: number | string): Promise<StaffUser> {
  return payloadRequest(`/api/users/${id}?depth=0`)
}

/**
 * The Author record linked to a staff account, or null when they have none
 * yet (ADR-0007). Someone who has never published has no author record, and
 * that is a normal state rather than an error -- the profile editor creates
 * one on first save.
 */
export async function fetchAuthorForUser(
  userId: number | string,
): Promise<Author | null> {
  // depth=1 populates the avatar upload relationship for preview
  const response = (await payloadRequest(
    `/api/authors?where[user][equals]=${userId}&limit=1&depth=1`,
  )) as { docs?: Author[] }
  return response.docs?.[0] ?? null
}

/** Every author, for joining onto the staff table by linked account. */
export async function fetchAuthors(): Promise<Author[]> {
  const response = (await payloadRequest(
    '/api/authors?limit=200&sort=displayName&depth=0',
  )) as { docs?: Author[] }
  return response.docs ?? []
}

export async function createAuthorForUser(
  userId: number | string,
  patch: AuthorPatch,
): Promise<Author> {
  const response = (await payloadMutation(
    '/api/authors',
    'POST',
    { ...patch, user: Number(userId) },
  )) as { doc?: Author }
  if (!response.doc) {
    throw new Error('Payload returned no created author document.')
  }
  return response.doc
}

export async function updateAuthor(
  id: number | string,
  patch: AuthorPatch,
): Promise<Author> {
  const response = (await payloadMutation(`/api/authors/${id}`, 'PATCH', patch)) as {
    doc?: Author
  }
  if (!response.doc) {
    throw new Error('Payload returned no updated author document.')
  }
  return response.doc
}

export async function updateStaffUser(
  id: number | string,
  patch: StaffUserPatch,
): Promise<StaffUser> {
  const response = (await payloadMutation(`/api/users/${id}`, 'PATCH', patch)) as {
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
export async function uploadAvatarAsset(file: File): Promise<AvatarAsset> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('_payload', JSON.stringify({ alt_text: 'Author profile avatar' }))

  const response = await fetch(`${PAYLOAD_API_URL}/api/media-assets`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'include',
    headers: { },
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

export async function fetchStaffUsers(): Promise<StaffUser[]> {
  const response = (await payloadRequest('/api/users?limit=200&sort=email&depth=0')) as {
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
): Promise<StaffUser> {
  const response = (await payloadMutation(
    '/api/users',
    'POST',
    { ...input, password: generateDiscardedPassword() },
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
  // Unauthenticated by design, yet it still carries the caller's session
  // cookie via the shared client. Harmless: Payload's `forgotPassword`
  // never reads `req.user`, and questura throttles it on IP plus email, not on
  // identity — so an authenticated caller gets the same bucket as an anonymous
  // one.
  await payloadMutation('/api/users/forgot-password', 'POST', { email })
}

/**
 * Recent transactional-email delivery log (admin-only on the server). Rows are
 * written by questura's email tracking; an empty result may just mean tracking
 * is disabled (EMAIL_TRACKING=false).
 */
export async function fetchEmailLogs(limit = 50): Promise<EmailLog[]> {
  const response = (await payloadRequest(
    `/api/email-logs?limit=${limit}&sort=-createdAt&depth=0`,
  )) as { docs?: EmailLog[] }
  return response.docs ?? []
}

/**
 * Moves an account between writer and editor (ADR-0007). The server allows
 * this in both directions but never grants `admin` by update, and refuses a
 * change to your own account.
 */
export async function changeStaffRole(
  id: number | string,
  role: AssignableStaffRole,
): Promise<StaffUser> {
  const response = (await payloadMutation(`/api/users/${id}`, 'PATCH', { role })) as {
    doc?: StaffUser
  }
  if (!response.doc) {
    throw new Error('Payload returned no updated user document.')
  }
  return response.doc
}

/**
 * Offboarding without destroying the record (ADR-0007). Disabling revokes the
 * member's live sessions and bars sign-in, while their author page and every
 * byline pointing at them keep working.
 */
export async function setStaffStatus(
  id: number | string,
  status: StaffStatus,
): Promise<StaffUser> {
  const response = (await payloadMutation(`/api/users/${id}`, 'PATCH', { status })) as {
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
