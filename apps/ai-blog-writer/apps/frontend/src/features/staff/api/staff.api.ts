import { PAYLOAD_API_URL } from '../../../shared/api/client/config'
import { payloadMutation, payloadRequest } from '../../../shared/api/client/http'
import type { AvatarAsset, StaffUser, StaffUserPatch } from '../types'

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

export function avatarUrl(avatar: AvatarAsset | number | null | undefined): string | null {
  if (!avatar || typeof avatar === 'number') return null
  if (avatar.url) return avatar.url
  if (avatar.filename) return `${PAYLOAD_API_URL}/api/media-assets/file/${avatar.filename}`
  return null
}
