import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { Providers } from './app/providers'
import { env } from './lib/env'
import './index.css'

/**
 * There is no real backend: the mock worker serves /api in dev, e2e and production builds.
 * We wait for it to be ready before the first render so no request slips past it.
 */
async function enableMocking(): Promise<void> {
  if (!env.mswEnabled) return
  const { worker } = await import('./mocks/browser')
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: !env.isDev,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  })
}

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

void enableMocking().then(() => {
  createRoot(container).render(
    <StrictMode>
      <Providers>
        <App />
      </Providers>
    </StrictMode>,
  )
})
