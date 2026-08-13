import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { purgeLegacyStoredAuth } from './features/auth/auth-session-store'

// Delete the Staff JWT earlier builds persisted, before anything else runs.
purgeLegacyStoredAuth()

// Backend requests no longer carry a token from here. The browser attaches the
// httpOnly `payload-token` cookie itself and the backend reads that as caller
// identity, so there is nothing for the app to register — see `apiFetch`.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
