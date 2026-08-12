import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { getLiveAuthState, purgeLegacyStoredAuth } from './features/auth/auth-session-store'
import { setApiAuthTokenProvider } from './shared/api/client/auth-token'

// Delete the Staff JWT earlier builds persisted, before anything else runs.
purgeLegacyStoredAuth()

// Backend requests carry the staff session so the server can authorize the
// caller itself. Registered here rather than imported inside `apiFetch` so
// `shared/` keeps no dependency on `features/`. `getLiveAuthState` returns null
// for an expired session, so a stale token is never sent.
setApiAuthTokenProvider(() => getLiveAuthState()?.token ?? null)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
