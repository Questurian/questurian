/**
 * A signed-in session for local work, when there is nothing to sign in to.
 *
 * The credential this app uses is Payload's httpOnly `payload-token` cookie,
 * so being logged in requires Payload to be running and reachable. It is not
 * running on the machine this app is developed on and is not meant to be:
 * Questura is a live-only environment. The practical effect was that nobody
 * could open a writer screen locally without hand-editing `RequireAuth` and
 * remembering to put it back — which was done twice in one session, and the
 * second time only because the first was noticed.
 *
 * So the bypass is written down instead of improvised, and it is fenced twice:
 *
 * 1. `import.meta.env.DEV` is replaced with a literal at build time, so in a
 *    production bundle this whole branch is `false` and the bundler removes
 *    it. There is no flag anyone can set on a deployed build to switch it on.
 * 2. `VITE_DEV_OFFLINE_LOGIN` must be set explicitly. It is absent from `.env`
 *    and documented in `.env.example`, so it is opted into per machine rather
 *    than inherited.
 * 3. It is off under `vitest`. A suite whose result depends on whether the
 *    person running it happens to have a flag in their own `.env` is not a
 *    suite -- and this was not hypothetical: turning the flag on locally
 *    immediately broke `AuthProvider.test.tsx`, which asserts that a signed-out
 *    visitor is sent to the login page. A test that wants this behaviour asks
 *    for it explicitly.
 *
 * All three, not any. The user it returns is named so that nobody reading a
 * screenshot mistakes it for a real account.
 *
 * What it does NOT do is tell "Payload is unreachable" apart from "Payload says
 * you are signed out" -- `hydratePayloadSession` returns null for both, and
 * with the flag on either one produces the local session. That is exactly what
 * the flag asks for, and it is why it may only ever be set by hand on a
 * development machine.
 */

import type { AuthState } from './auth-context';

// Far enough out that a long session never lapses mid-test; not infinite, so
// the expiry path is still the same code everything else uses.
const A_DAY = 24 * 60 * 60 * 1000;

export function offlineDevSession(): AuthState | null {
  if (!import.meta.env.DEV) return null;
  if (import.meta.env.MODE === 'test') return null;
  if (import.meta.env.VITE_DEV_OFFLINE_LOGIN !== 'true') return null;
  return {
    expiresAt: Date.now() + A_DAY,
    user: {
      id: 'dev-offline',
      email: 'dev@localhost.invalid',
      // Admin because the point is to reach every screen. This grants nothing:
      // the backend decides what it will do, and its own staff check is a
      // separate flag that is off by default in development.
      role: 'admin',
      firstName: 'Local',
      lastName: 'Dev (not a real login)',
    },
  };
}

export function offlineDevSessionActive(): boolean {
  return offlineDevSession() !== null;
}
