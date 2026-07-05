import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RequireAuth from './RequireAuth';
import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createToken(expiresAtMs: number): string {
  return [
    toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    toBase64Url(JSON.stringify({ exp: Math.floor(expiresAtMs / 1000) })),
    'signature',
  ].join('.');
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
  const { login, logout, isRestoringSession } = useAuth();

  return (
    <div>
      <span>{isRestoringSession ? 'restoring' : 'ready'}</span>
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
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('waits for session restoration before redirecting to login and persists the refreshed auth state', async () => {
    const token = createToken(Date.now() + 60 * 60 * 1000);
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
        token,
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
    expect(localStorage.getItem('payload_auth')).toContain('writer@example.com');
  });

  it('uses Payload users endpoints for staff restore, login, and logout', async () => {
    const token = createToken(Date.now() + 60 * 60 * 1000);
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/auth/')) {
        return Promise.reject(new Error(`legacy auth endpoint called: ${url}`));
      }

      if (url.endsWith('/api/users/login')) {
        return Promise.resolve(jsonResponse({
          token,
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
      expect(localStorage.getItem('payload_auth')).toContain('writer@example.com');
    });

    await userEvent.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => {
      expect(localStorage.getItem('payload_auth')).toBeNull();
    });

    const calledUrls = fetchMock.mock.calls.map(([input]) => String(input));

    expect(calledUrls).toContain('http://localhost:4000/api/users/refresh-token');
    expect(calledUrls).toContain('http://localhost:4000/api/users/me');
    expect(calledUrls).toContain('http://localhost:4000/api/users/login');
    expect(calledUrls).toContain('http://localhost:4000/api/users/logout');
    expect(calledUrls.some((url) => url.includes('/api/auth/'))).toBe(false);
  });

  it('refreshes a stale stored role from /api/users/me on hydrate', async () => {
    const token = createToken(Date.now() + 60 * 60 * 1000);
    localStorage.setItem('payload_auth', JSON.stringify({
      token,
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: {
        id: '17',
        email: 'writer@example.com',
        role: 'writer',
      },
    }));

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);

        if (url.endsWith('/api/users/me')) {
          return Promise.resolve(jsonResponse({
            token,
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

    renderProtectedApp();

    await waitFor(() => {
      expect(screen.getByText('protected page')).toBeInTheDocument();
    });

    const persisted = JSON.parse(localStorage.getItem('payload_auth') ?? '{}');
    expect(persisted.user.role).toBe('editor');
  });

  it('logs out when the stored token is rejected by /me and refresh fails', async () => {
    const token = createToken(Date.now() + 60 * 60 * 1000);
    localStorage.setItem('payload_auth', JSON.stringify({
      token,
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: {
        id: '17',
        email: 'writer@example.com',
        role: 'writer',
      },
    }));

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

    expect(localStorage.getItem('payload_auth')).toBeNull();
  });
});
