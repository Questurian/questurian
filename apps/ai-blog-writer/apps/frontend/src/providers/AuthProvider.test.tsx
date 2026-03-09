import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RequireAuth from '../components/RequireAuth';
import { AuthProvider } from './AuthProvider';

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

        if (url.endsWith('/api/users/refresh-token')) {
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

    resolveRestore?.(
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
});
