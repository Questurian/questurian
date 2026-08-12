import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { readStoredAuth } from './features/auth/auth-storage'
import { setApiAuthTokenProvider } from './shared/api/client/auth-token'

// Backend requests carry the staff session so the server can authorize the
// caller itself. Registered here rather than imported inside `apiFetch` so
// `shared/` keeps no dependency on `features/`. `readStoredAuth` returns null
// for an expired session, so a stale token is never sent.
setApiAuthTokenProvider(() => readStoredAuth()?.token ?? null)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
