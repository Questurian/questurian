import { PAYLOAD_API_URL } from '../../../shared/api/client/config'
import {
  payloadMutation,
  payloadRequest
} from '../../../shared/api/client/http'
import type {
  AssignableStaffRole,
  Author,
  AuthorMediaSet,
  AuthorPatch,
  AvatarAsset,
  EmailLog,
  StaffStatus,
  StaffUser,
  StaffUserPatch
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
  userId: number | string
): Promise<Author | null> {
  // depth=1 populates the avatar upload relationship for preview
  const response = (await payloadRequest(
    `/api/authors?where[user][equals]=${userId}&limit=1&depth=1`
  )) as { docs?: Author[] }
  return response.docs?.[0] ?? null
}

/** Every author, for joining onto the staff table by linked account. */
export async function fetchAuthors(): Promise<Author[]> {
  const response = (await payloadRequest(
    '/api/authors?limit=200&sort=displayName&depth=0'
  )) as { docs?: Author[] }
  return response.docs ?? []
}

/** One author by its own id -- the only way to address an orphan byline. */
export async function fetchAuthorById(id: number | string): Promise<Author> {
  return payloadRequest(`/api/authors/${id}?depth=1`)
}

/**
 * The Author Directory listing (ADR-0011). Sends the same filter the server's
 * `Authors.update` access rule applies, so an editor is shown only rows they
 * can in fact save. This is a UI convenience and a deliberate duplication of
 * server logic -- Payload stays the enforcement point; the alternative is
 * offering an editor rows that 403 on save.
 *
 * An admin sends no filter, because their access rule has none.
 *
 * The role branch traverses the `user` relationship, which is a SQL join and
 * needs no read access on `users` -- the reason an editor can scope by role
 * while being unable to read a single staff identity.
 */
export async function fetchEditableAuthors(
  scope: 'all' | 'writers-and-orphans',
  selfUserId: number | string
): Promise<Author[]> {
  const base = '/api/authors?limit=200&sort=displayName&depth=1'

  // Mirrors all three branches of the editor clause in Authors.update, own
  // record included -- an editor whose directory silently omitted them would
  // not match the rule it claims to preview.
  const query =
    scope === 'all'
      ? base
      : `${base}` +
        `&where[or][0][user][equals]=${selfUserId}` +
        `&where[or][1][user.role][equals]=writer` +
        `&where[or][2][user][exists]=false`

  const response = (await payloadRequest(query)) as { docs?: Author[] }
  return response.docs ?? []
}

export async function createAuthorForUser(
  userId: number | string,
  patch: AuthorPatch
): Promise<Author> {
  const response = (await payloadMutation('/api/authors', 'POST', {
    ...patch,
    user: Number(userId)
  })) as { doc?: Author }
  if (!response.doc) {
    throw new Error('Payload returned no created author document.')
  }
  return response.doc
}

export async function updateAuthor(
  id: number | string,
  patch: AuthorPatch
): Promise<Author> {
  const response = (await payloadMutation(
    `/api/authors/${id}`,
    'PATCH',
    patch
  )) as {
    doc?: Author
  }
  if (!response.doc) {
    throw new Error('Payload returned no updated author document.')
  }
  return response.doc
}

export async function updateStaffUser(
  id: number | string,
  patch: StaffUserPatch
): Promise<StaffUser> {
  const response = (await payloadMutation(
    `/api/users/${id}`,
    'PATCH',
    patch
  )) as {
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
  formData.append(
    '_payload',
    JSON.stringify({ alt_text: 'Author profile avatar' })
  )

  const response = await fetch(`${PAYLOAD_API_URL}/api/media-assets`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'include',
    headers: {},
    body: formData
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Avatar upload failed: ${response.status}${text ? ` — ${text}` : ''}`
    )
  }

  const data = (await response.json()) as { doc?: AvatarAsset }
  if (!data.doc?.id) {
    throw new Error('Avatar upload returned no media asset document.')
  }
  return data.doc
}

export async function fetchMediaSet(
  id: number | string
): Promise<AuthorMediaSet> {
  return payloadRequest(`/api/media-sets/${id}?depth=2`)
}

export async function uploadAuthorMediaSet(input: {
  file: File
  title: string
  altText: string
}): Promise<AuthorMediaSet> {
  const formData = new FormData()
  formData.append('source', input.file)
  formData.append(
    'data',
    JSON.stringify({
      title: input.title.trim(),
      alt_text: input.altText.trim()
    })
  )

  const response = await fetch(
    `${PAYLOAD_API_URL}/api/media-sets/from-source`,
    {
      method: 'POST',
      mode: 'cors',
      credentials: 'include',
      body: formData
    }
  )

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Author image upload failed: ${response.status}${text ? ` — ${text}` : ''}`
    )
  }

  const data = (await response.json()) as { mediaSetId?: number }
  if (!data.mediaSetId) {
    throw new Error('Author image upload returned no media set id.')
  }
  return fetchMediaSet(data.mediaSetId)
}

export async function updateAuthorMediaSetPlacement(
  id: number | string,
  focalPoint: { x: number; y: number }
): Promise<AuthorMediaSet> {
  const response = (await payloadMutation(`/api/media-sets/${id}`, 'PATCH', {
    focal_point: focalPoint
  })) as { doc?: AuthorMediaSet }
  if (!response.doc) {
    throw new Error('Payload returned no updated media set document.')
  }
  return response.doc
}

export async function regenerateAuthorMediaSet(
  id: number | string
): Promise<void> {
  const response = await fetch(
    `${PAYLOAD_API_URL}/api/media-sets/${id}/regenerate`,
    {
      method: 'POST',
      mode: 'cors',
      credentials: 'include'
    }
  )
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `Image crops regenerate failed: ${response.status}${text ? ` — ${text}` : ''}`
    )
  }
}

export async function fetchStaffUsers(): Promise<StaffUser[]> {
  const response = (await payloadRequest(
    '/api/users?limit=200&sort=email&depth=0'
  )) as {
    docs?: StaffUser[]
  }
  return response.docs ?? []
}

/**
 * Invite-style onboarding (ADR-0023): the account is created with a random
 * password that is never shown to anyone; the new hire sets their own via the
 * password-set email. Only `writer` and `editor` can be created from ABW.
 */
export async function createStaffUser(input: {
  email: string
  firstName: string
  lastName: string
  role: 'writer' | 'editor'
}): Promise<StaffUser> {
  const response = (await payloadMutation('/api/users', 'POST', {
    ...input,
    password: generateDiscardedPassword()
  })) as { doc?: StaffUser }
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
    `/api/email-logs?limit=${limit}&sort=-createdAt&depth=0`
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
  role: AssignableStaffRole
): Promise<StaffUser> {
  const response = (await payloadMutation(`/api/users/${id}`, 'PATCH', {
    role
  })) as {
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
  status: StaffStatus
): Promise<StaffUser> {
  const response = (await payloadMutation(`/api/users/${id}`, 'PATCH', {
    status
  })) as {
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
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  )
}

export function avatarUrl(
  avatar: AvatarAsset | number | null | undefined
): string | null {
  if (!avatar || typeof avatar === 'number') return null
  if (avatar.url) return avatar.url
  if (avatar.filename)
    return `${PAYLOAD_API_URL}/api/media-assets/file/${avatar.filename}`
  return null
}

export function mediaSetPreviewUrl(
  mediaSet: AuthorMediaSet | number | null | undefined
): string | null {
  if (!mediaSet || typeof mediaSet === 'number') return null
  const variants = mediaSet.variants ?? {}
  for (const key of ['square', 'portrait', 'thumbnail', 'wide']) {
    const asset = variants[key]
    const url = avatarUrl(asset as AvatarAsset | number | null | undefined)
    if (url) return url
  }
  return null
}

export function mediaSetSourceUrl(
  mediaSet: AuthorMediaSet | number | null | undefined
): string | null {
  if (!mediaSet || typeof mediaSet === 'number') return null
  return avatarUrl(mediaSet.source as AvatarAsset | number | null | undefined)
}
