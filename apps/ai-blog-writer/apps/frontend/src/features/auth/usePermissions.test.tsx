import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPermissionsCache, usePermissions } from './usePermissions';
import { useAuth } from './useAuth';
import { fetchAccessPermissions } from './permissions-client';

vi.mock('./useAuth');
vi.mock('./permissions-client');

const mockUseAuth = vi.mocked(useAuth);
const mockFetchAccess = vi.mocked(fetchAccessPermissions);

function stubAuth(role: string | undefined, token: string | null = 'token-1') {
  mockUseAuth.mockReturnValue({
    token,
    expiresAt: Date.now() + 60_000,
    user: token ? { id: '1', email: 'user@example.com', role } : null,
    isAuthenticated: Boolean(token),
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
    stubAuth(undefined, null);

    const { result } = renderHook(() => usePermissions());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.canManagePublished).toBe(false);
    expect(result.current.role).toBeNull();
    expect(mockFetchAccess).not.toHaveBeenCalled();
  });
});
