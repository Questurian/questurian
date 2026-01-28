import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import App from './App.tsx'
import { QueryProvider, AlertProvider, ToastProvider } from '@client/shared/providers'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <AlertProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AlertProvider>
    </QueryProvider>
  </StrictMode>,
)
