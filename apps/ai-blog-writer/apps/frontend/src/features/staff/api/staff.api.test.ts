import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  avatarUrl,
  changeStaffRole,
  createAuthorForUser,
  fetchAuthorForUser,
  createStaffUser,
  fetchEmailLogs,
  fetchStaffUser,
  fetchStaffUsers,
  requestPasswordSetEmail,
  setStaffStatus,
  updateAuthor,
  updateStaffUser,
  uploadAvatarAsset,
} from './staff.api'

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
  // depth=0: the account carries no relationships worth populating now that
  // authorship (and its avatar) live on the author record.
  it('fetches the staff user with the session cookie, not a header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 3, email: 'w@questurian.com', role: 'writer' }))

    const user = await fetchStaffUser(3, 'token-1')

    expect(user.id).toBe(3)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/users/3?depth=0')
    expect(new Headers(init.headers).get('Authorization')).toBeNull()
    expect(init.credentials).toBe('include')
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

  // The slug is authorship, so it is patched on the author record, not the
  // account (ADR-0007).
  it('passes admin slug renames through the author patch', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ doc: { id: 9, displayName: 'Ana Writes', slug: 'ana-writes' } }),
    )

    const author = await updateAuthor(9, { slug: 'ana-writes' }, 'token-1')

    expect(author.slug).toBe('ana-writes')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/authors/9')
    expect(JSON.parse(init.body)).toEqual({ slug: 'ana-writes' })
  })

  it('looks an author up by the account it is linked to', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ docs: [{ id: 9, displayName: 'Ana Writes' }] }))

    const author = await fetchAuthorForUser(3, 'token-1')

    expect(author?.id).toBe(9)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/authors?where[user][equals]=3')
  })

  it('reports no author rather than failing when an account has none yet', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ docs: [] }))

    await expect(fetchAuthorForUser(3, 'token-1')).resolves.toBeNull()
  })

  it('creates an author linked to the account on first save', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ doc: { id: 9, displayName: 'Ana Writes', user: 3 } }),
    )

    const author = await createAuthorForUser(3, { displayName: 'Ana Writes' }, 'token-1')

    expect(author.id).toBe(9)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/authors')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ displayName: 'Ana Writes', user: 3 })
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
    expect(new Headers(init.headers).get('Authorization')).toBeNull()
    expect(init.credentials).toBe('include')
  })

  it('surfaces upload failures with status and body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ errors: [{ message: 'nope' }] }, false, 403))

    await expect(
      uploadAvatarAsset(new File(['x'], 'a.jpg', { type: 'image/jpeg' }), 'token-1'),
    ).rejects.toThrow('Avatar upload failed: 403')
  })

  it('lists staff users from the docs envelope', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ docs: [{ id: 1, email: 'a@questurian.com', role: 'admin' }] }),
    )

    const users = await fetchStaffUsers('token-1')

    expect(users).toHaveLength(1)
    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/users?limit=200')
  })

  it('creates a staff user with a discarded random password', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ doc: { id: 5, email: 'new@questurian.com', role: 'writer' } }),
    )

    const created = await createStaffUser(
      { email: 'new@questurian.com', firstName: 'New', lastName: 'Writer', role: 'writer' },
      'token-1',
    )

    expect(created.id).toBe(5)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/users')
    const body = JSON.parse(init.body)
    expect(body.role).toBe('writer')
    // Random creation password is present, unguessable-length, never shown
    expect(typeof body.password).toBe('string')
    expect(body.password.length).toBeGreaterThanOrEqual(32)
  })

  it('requests the password-set email without auth', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))

    await requestPasswordSetEmail('new@questurian.com')

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/users/forgot-password')
    expect(JSON.parse(init.body)).toEqual({ email: 'new@questurian.com' })
    expect(new Headers(init.headers).get('Authorization')).toBeNull()
  })

  it('fetches recent email logs newest-first on the session cookie', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        docs: [
          {
            id: 2,
            emailType: 'password-set-link',
            recipient: 'new@questurian.com',
            status: 'sent',
            createdAt: '2026-07-17T10:00:00.000Z',
          },
        ],
      }),
    )

    const logs = await fetchEmailLogs('token-1')

    expect(logs).toHaveLength(1)
    expect(logs[0].emailType).toBe('password-set-link')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/email-logs?limit=50&sort=-createdAt')
    expect(new Headers(init.headers).get('Authorization')).toBeNull()
    expect(init.credentials).toBe('include')
  })

  it('returns an empty log list when the collection has no docs', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ docs: [] }))

    expect(await fetchEmailLogs('token-1')).toEqual([])
  })

  it('promotes a writer to editor via role patch', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ doc: { id: 5, email: 'new@questurian.com', role: 'editor' } }),
    )

    const updated = await changeStaffRole(5, 'editor', 'token-1')

    expect(updated.role).toBe('editor')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/users/5')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ role: 'editor' })
  })

  it('demotes an editor back to writer through the same patch', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ doc: { id: 5, email: 'new@questurian.com', role: 'writer' } }),
    )

    const updated = await changeStaffRole(5, 'writer', 'token-1')

    expect(updated.role).toBe('writer')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ role: 'writer' })
  })

  it('disables and re-enables an account via status patch', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ doc: { id: 5, email: 'new@questurian.com', role: 'writer', status: 'disabled' } }),
    )

    const disabled = await setStaffStatus(5, 'disabled', 'token-1')

    expect(disabled.status).toBe('disabled')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/api/users/5')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body)).toEqual({ status: 'disabled' })

    fetchMock.mockResolvedValue(
      jsonResponse({ doc: { id: 5, email: 'new@questurian.com', role: 'writer', status: 'active' } }),
    )

    const reenabled = await setStaffStatus(5, 'active', 'token-1')

    expect(reenabled.status).toBe('active')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ status: 'active' })
  })

  it('throws when a status patch comes back without a document', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))

    await expect(setStaffStatus(5, 'disabled', 'token-1')).rejects.toThrow(
      'Payload returned no updated user document.',
    )
  })

  it('resolves avatar URLs from doc url, filename, or not at all', () => {
    expect(avatarUrl({ id: 1, url: 'https://cdn/x.jpg' })).toBe('https://cdn/x.jpg')
    expect(avatarUrl({ id: 1, filename: 'x.jpg' })).toContain('/api/media-assets/file/x.jpg')
    expect(avatarUrl(5)).toBeNull()
    expect(avatarUrl(null)).toBeNull()
  })
})
