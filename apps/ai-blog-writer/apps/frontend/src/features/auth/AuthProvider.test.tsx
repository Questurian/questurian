import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RequireAuth from './RequireAuth';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';
import { getLiveAuthState, purgeLegacyStoredAuth, setLiveAuthState } from './auth-session-store';
import { LEGACY_AUTH_STORAGE_KEY } from './auth.constants';

/**
 * Payload reports session expiry as `exp` (seconds) on login, refresh-token and
 * me. The app reads that field; it no longer decodes a JWT, because it no longer
 * has one. Mocked responses therefore carry `exp`, not a token.
 */
function expSeconds(expiresAtMs: number): number {
  return Math.floor(expiresAtMs / 1000);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function renderProtectedApp() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route
            path="/protected"
            element={(
              <RequireAuth>
                <div>protected page</div>
              </RequireAuth>
            )}
          />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

function AuthHarness() {
  const { login, logout, isRestoringSession, user } = useAuth();

  return (
    <div>
      <span>{isRestoringSession ? 'restoring' : 'ready'}</span>
      <span data-testid="role">{user?.role ?? 'none'}</span>
      <span data-testid="email">{user?.email ?? 'none'}</span>
      <button type="button" onClick={() => void login('writer@example.com', 'secret')}>
        login
      </button>
      <button type="button" onClick={logout}>
        logout
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    setLiveAuthState(null);
  });

  afterEach(() => {
    setLiveAuthState(null);
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('waits for session restoration before redirecting to login', async () => {
    const exp = expSeconds(Date.now() + 60 * 60 * 1000);
    let resolveRestore: ((response: Response) => void) | null = null;

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/api/users/me')) {
          return new Promise<Response>((resolve) => {
            resolveRestore = resolve;
          });
        }

        if (url.endsWith('/api/health')) {
          return Promise.resolve(jsonResponse({ ok: true }));
        }

        return Promise.resolve(jsonResponse({ message: 'not found' }, 404));
      }),
    );

    renderProtectedApp();

    expect(screen.queryByText('login page')).not.toBeInTheDocument();
    expect(screen.queryByText('protected page')).not.toBeInTheDocument();

    const completeRestore = resolveRestore as ((response: Response) => void) | null;
    completeRestore?.(
      jsonResponse({
        exp,
        user: {
          id: 17,
          email: 'writer@example.com',
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('protected page')).toBeInTheDocument();
    });

    expect(screen.queryByText('login page')).not.toBeInTheDocument();
    expect(getLiveAuthState()?.user.email).toBe('writer@example.com');
  });

  it('uses Payload users endpoints for staff restore, login, and logout', async () => {
    const exp = expSeconds(Date.now() + 60 * 60 * 1000);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/auth/')) {
        return Promise.reject(new Error(`legacy auth endpoint called: ${url}`));
      }

      if (url.endsWith('/api/users/login')) {
        return Promise.resolve(jsonResponse({
          exp,
          user: {
            id: 17,
            email: 'writer@example.com',
            role: 'writer',
          },
        }));
      }

      if (url.endsWith('/api/users/logout') || url.endsWith('/api/health')) {
        return Promise.resolve(jsonResponse({ ok: true }));
      }

      return Promise.resolve(jsonResponse({ message: 'not found' }, 404));
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await screen.findByText('ready');

    await userEvent.click(screen.getByRole('button', { name: 'login' }));

    await waitFor(() => {
      expect(screen.getByTestId('email')).toHaveTextContent('writer@example.com');
    });

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => {
      expect(getLiveAuthState()).toBeNull();
    });

    const calledUrls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(calledUrls).toContain('http://localhost:4000/api/users/refresh-token');
    expect(calledUrls).toContain('http://localhost:4000/api/users/me');
    expect(calledUrls).toContain('http://localhost:4000/api/users/login');
    expect(calledUrls).toContain('http://localhost:4000/api/users/logout');
    expect(calledUrls.some((url) => url.includes('/api/auth/'))).toBe(false);
  });

  it('refreshes a stale role from /api/users/me on hydrate', async () => {
    const exp = expSeconds(Date.now() + 60 * 60 * 1000);
    setLiveAuthState({
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: {
        id: '17',
        email: 'writer@example.com',
        role: 'writer',
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/api/users/me')) {
          return Promise.resolve(jsonResponse({
            exp,
            user: {
              id: 17,
              email: 'writer@example.com',
              role: 'editor',
            },
          }));
        }

        if (url.endsWith('/api/health')) {
          return Promise.resolve(jsonResponse({ ok: true }));
        }

        return Promise.resolve(jsonResponse({ message: 'not found' }, 404));
      }),
    );

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('role')).toHaveTextContent('editor');
    });

    expect(getLiveAuthState()?.user.role).toBe('editor');
  });

  it('logs out when the session is rejected by /me and refresh fails', async () => {
    const exp = expSeconds(Date.now() + 60 * 60 * 1000);
    setLiveAuthState({
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: {
        id: '17',
        email: 'writer@example.com',
        role: 'writer',
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/api/users/me')) {
          // Payload returns 200 with a null user for invalid sessions.
          return Promise.resolve(jsonResponse({ user: null, message: 'Account' }));
        }

        if (url.endsWith('/api/users/refresh-token')) {
          return Promise.resolve(jsonResponse({ message: 'Forbidden' }, 403));
        }

        if (url.endsWith('/api/health')) {
          return Promise.resolve(jsonResponse({ ok: true }));
        }

        return Promise.resolve(jsonResponse({ message: 'not found' }, 404));
      }),
    );

    renderProtectedApp();

    await waitFor(() => {
      expect(screen.getByText('login page')).toBeInTheDocument();
    });

    expect(getLiveAuthState()).toBeNull();
  });
});

/**
 * The point of the change: an XSS that reads `localStorage` finds no Staff
 * credential, and a reload restores the session from the httpOnly cookie
 * instead of from disk.
 */
describe('the Staff token exists nowhere in JavaScript', () => {
  beforeEach(() => {
    setLiveAuthState(null);
  });

  afterEach(() => {
    setLiveAuthState(null);
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('writes nothing to localStorage on login', async () => {
    const exp = expSeconds(Date.now() + 60 * 60 * 1000);

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/api/users/login')) {
          return Promise.resolve(jsonResponse({
            exp,
            user: { id: 17, email: 'writer@example.com', role: 'writer' },
          }));
        }

        if (url.endsWith('/api/health')) {
          return Promise.resolve(jsonResponse({ ok: true }));
        }

        return Promise.resolve(jsonResponse({ message: 'not found' }, 404));
      }),
    );

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await screen.findByText('ready');
    await userEvent.click(screen.getByRole('button', { name: 'login' }));

    await waitFor(() => {
      expect(screen.getByTestId('email')).toHaveTextContent('writer@example.com');
    });

    expect(localStorage.length).toBe(0);
    // Stronger than "not on disk": the in-memory session has no token field at
    // all, so there is no credential for an XSS payload to read from anywhere.
    expect(getLiveAuthState()).not.toHaveProperty('token');
  });

  it('restores the session from the cookie alone, without writing it back to disk', async () => {
    const exp = expSeconds(Date.now() + 60 * 60 * 1000);
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/users/me')) {
        return Promise.resolve(jsonResponse({
          exp,
          user: { id: 17, email: 'writer@example.com', role: 'editor' },
        }));
      }

      if (url.endsWith('/api/health')) {
        return Promise.resolve(jsonResponse({ ok: true }));
      }

      return Promise.resolve(jsonResponse({ message: 'not found' }, 404));
    });

    vi.stubGlobal('fetch', fetchMock);

    // Nothing in memory and nothing on disk — a fresh page load.
    renderProtectedApp();

    await waitFor(() => {
      expect(screen.getByText('protected page')).toBeInTheDocument();
    });

    const meCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith('/api/users/me'));
    const init = meCall?.[1] as RequestInit | undefined;

    // The cookie is the only credential available, so it has to be sent...
    expect(init?.credentials).toBe('include');
    // ...and no Authorization header can have been derived from storage.
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    // The restored session lands in memory and nowhere else — and carries no
    // token at all, which is the point: there is nothing left to exfiltrate.
    expect(getLiveAuthState()?.user.email).toBe('writer@example.com');
    expect(getLiveAuthState()).not.toHaveProperty('token');
    expect(localStorage.length).toBe(0);
  });

  it('shows a restoring state rather than a blank screen while the cookie is checked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/api/users/me')) {
          // Never resolves: hold the app in the restore window.
          return new Promise<Response>(() => {});
        }

        if (url.endsWith('/api/health')) {
          return Promise.resolve(jsonResponse({ ok: true }));
        }

        return Promise.resolve(jsonResponse({ message: 'not found' }, 404));
      }),
    );

    // Every reload now takes this path, where a stored session used to skip it.
    renderProtectedApp();

    expect(await screen.findByText('Restoring session')).toBeInTheDocument();
    expect(screen.queryByText('login page')).not.toBeInTheDocument();
  });

  it('logs out on the cookie, not on a token that may already be expired', async () => {
    const exp = expSeconds(Date.now() + 60 * 60 * 1000);
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith('/api/users/login')) {
        return Promise.resolve(jsonResponse({
          exp,
          user: { id: 17, email: 'writer@example.com', role: 'writer' },
        }));
      }

      if (url.endsWith('/api/users/logout') || url.endsWith('/api/health')) {
        return Promise.resolve(jsonResponse({ ok: true }));
      }

      return Promise.resolve(jsonResponse({ message: 'not found' }, 404));
    });

    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    await screen.findByText('ready');
    await userEvent.click(screen.getByRole('button', { name: 'login' }));
    await waitFor(() => {
      expect(screen.getByTestId('email')).toHaveTextContent('writer@example.com');
    });

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) =>
        String(input).endsWith('/api/users/logout'))).toBe(true);
    });

    const logoutCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith('/api/users/logout'));
    const init = logoutCall?.[1] as RequestInit | undefined;

    // Payload clears the cookie only on a 2xx, and `extractJWT` uses the first
    // token it finds. An expired Bearer would be extracted, fail to verify and
    // leave the cookie alive — which now silently restores the session on the
    // next load.
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    expect(init?.credentials).toBe('include');
  });

  it('purges a token left on disk by an earlier build', () => {
    localStorage.setItem(LEGACY_AUTH_STORAGE_KEY, JSON.stringify({ token: 'stale' }));

    purgeLegacyStoredAuth();

    expect(localStorage.getItem(LEGACY_AUTH_STORAGE_KEY)).toBeNull();
  });
});
