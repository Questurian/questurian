type TokenProvider = () => string | null

let provider: TokenProvider = () => null

/**
 * Registers where `apiFetch` reads the staff session token from.
 *
 * Injected rather than imported so `shared/` does not depend on `features/`.
 * The app wires this to the auth feature's storage at bootstrap; tests and
 * Storybook can supply their own provider, or none at all.
 */
export function setApiAuthTokenProvider(next: TokenProvider): void {
  provider = next
}

/** Resets to the default "no session" provider. Intended for tests. */
export function resetApiAuthTokenProvider(): void {
  provider = () => null
}

export function apiAuthToken(): string | null {
  try {
    return provider()
  } catch {
    // A broken provider must not take down every backend request; the call
    // simply goes out unauthenticated and the server decides.
    return null
  }
}
