import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPermissionsCache, usePermissions } from './usePermissions';
import { useAuth } from './useAuth';
import { fetchAccessPermissions } from './permissions-client';

vi.mock('./useAuth');
vi.mock('./permissions-client');

const mockUseAuth = vi.mocked(useAuth);
const mockFetchAccess = vi.mocked(fetchAccessPermissions);

function stubAuth(role: string | undefined, isSignedIn = true) {
  mockUseAuth.mockReturnValue({
    expiresAt: isSignedIn ? Date.now() + 60_000 : null,
    user: isSignedIn ? { id: '1', email: 'user@example.com', role } : null,
    isAuthenticated: isSignedIn,
    isRestoringSession: false,
    isConnected: true,
    connectionError: null,
    login: vi.fn(),
    logout: vi.fn(),
  });
}

describe('usePermissions', () => {
  afterEach(() => {
    clearPermissionsCache();
    vi.clearAllMocks();
  });

  it('grants canManagePublished when articles.update is unrestricted (true)', async () => {
    stubAuth('editor');
    mockFetchAccess.mockResolvedValue({ collections: { articles: { update: true } } });

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canManagePublished).toBe(true);
    expect(result.current.role).toBe('editor');
  });

  it('denies canManagePublished when articles.update is query-constrained (writer)', async () => {
    stubAuth('writer');
    mockFetchAccess.mockResolvedValue({
      collections: {
        articles: {
          update: { permission: true, where: { author: { equals: '1' } } },
        },
      },
    });

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canManagePublished).toBe(false);
  });

  it('falls back to the role when /api/access is unreachable', async () => {
    stubAuth('editor');
    mockFetchAccess.mockResolvedValue(null);

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canManagePublished).toBe(true);
  });

  it('denies everything without a token', async () => {
    stubAuth(undefined, false);

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canManagePublished).toBe(false);
    expect(result.current.canManageUsers).toBe(false);
    expect(result.current.role).toBeNull();
    expect(mockFetchAccess).not.toHaveBeenCalled();
  });

  it('grants canManageUsers when users.create is unrestricted (admin)', async () => {
    stubAuth('admin');
    mockFetchAccess.mockResolvedValue({ collections: { users: { create: true } } });

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canManageUsers).toBe(true);
  });

  it('denies canManageUsers when users.create is absent (editor/writer)', async () => {
    stubAuth('editor');
    mockFetchAccess.mockResolvedValue({ collections: { articles: { update: true } } });

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canManageUsers).toBe(false);
  });

  it('falls back to admin role for canManageUsers when /api/access is unreachable', async () => {
    stubAuth('admin');
    mockFetchAccess.mockResolvedValue(null);

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canManageUsers).toBe(true);
  });

  /**
   * canEditOtherAuthors gates the Author Directory. It cannot come from
   * `authors.update`: an editor and a writer both return
   * `{ permission: true, where: {...} }` there, so that response cannot tell
   * this surface's two audiences apart. It is taken from `articles.update`,
   * which is strict `true` for editor and admin and a `where` for a writer.
   */
  it('grants canEditOtherAuthors to an editor via articles.update === true', async () => {
    stubAuth('editor');
    mockFetchAccess.mockResolvedValue({ collections: { articles: { update: true } } });

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canEditOtherAuthors).toBe(true);
    // ...without granting anything on the staff-identity surface.
    expect(result.current.canManageUsers).toBe(false);
  });

  it('denies canEditOtherAuthors to a writer, whose articles.update is query-constrained', async () => {
    stubAuth('writer');
    mockFetchAccess.mockResolvedValue({
      collections: { articles: { update: { permission: true, where: { author: { equals: 5 } } } } },
    });

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canEditOtherAuthors).toBe(false);
  });

  it('grants canEditOtherAuthors to an admin', async () => {
    stubAuth('admin');
    mockFetchAccess.mockResolvedValue({
      collections: { articles: { update: true }, users: { create: true } },
    });

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canEditOtherAuthors).toBe(true);
  });
});
