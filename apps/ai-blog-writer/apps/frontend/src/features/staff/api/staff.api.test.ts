import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { avatarUrl, fetchStaffUser, updateStaffUser, uploadAvatarAsset } from './staff.api'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

describe('staff.api', () => {
  it('fetches the staff user with depth=1 and auth header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 3, email: 'w@questurian.com', role: 'writer' }))

    const user = await fetchStaffUser(3, 'token-1')

    expect(user.id).toBe(3)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/users/3?depth=1')
    expect(init.headers.Authorization).toBe('Bearer token-1')
  })

  it('updates the staff user and unwraps the doc', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ doc: { id: 3, email: 'w@questurian.com', role: 'writer', firstName: 'Ana' } }))

    const user = await updateStaffUser(3, { firstName: 'Ana' }, 'token-1')

    expect(user.firstName).toBe('Ana')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/users/3')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ firstName: 'Ana' })
  })

  it('throws when update returns no doc', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))

    await expect(updateStaffUser(3, {}, 'token-1')).rejects.toThrow('no updated user document')
  })

  it('uploads an avatar as multipart form data', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ doc: { id: 9, url: 'https://cdn/avatar.jpg' } }))

    const asset = await uploadAvatarAsset(new File(['x'], 'a.jpg', { type: 'image/jpeg' }), 'token-1')

    expect(asset.id).toBe(9)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/media-assets')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect(init.headers.Authorization).toBe('Bearer token-1')
  })

  it('surfaces upload failures with status and body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ errors: [{ message: 'nope' }] }, false, 403))

    await expect(
      uploadAvatarAsset(new File(['x'], 'a.jpg', { type: 'image/jpeg' }), 'token-1'),
    ).rejects.toThrow('Avatar upload failed: 403')
  })

  it('resolves avatar URLs from doc url, filename, or not at all', () => {
    expect(avatarUrl({ id: 1, url: 'https://cdn/x.jpg' })).toBe('https://cdn/x.jpg')
    expect(avatarUrl({ id: 1, filename: 'x.jpg' })).toContain('/api/media-assets/file/x.jpg')
    expect(avatarUrl(5)).toBeNull()
    expect(avatarUrl(null)).toBeNull()
  })
})
