/// <reference types="vite/client" />

// Declared so `import.meta.env.VITE_*` is `string | undefined`, never `any`.
interface ImportMetaEnv {
  readonly VITE_ENABLE_MSW?: string
  readonly VITE_MOCK_PANEL?: string
  readonly VITE_REQUEST_TIMEOUT_MS?: string
  readonly VITE_TRANSFER_TIMEOUT_MS?: string
  readonly VITE_TRANSFER_POLL_BASE_MS?: string
  readonly VITE_GET_RETRY_BASE_MS?: string
  readonly VITE_MOCK_LATENCY_MIN_MS?: string
  readonly VITE_MOCK_LATENCY_MAX_MS?: string
  readonly VITE_MOCK_FAILURE_RATE?: string
  readonly VITE_MOCK_TRANSFER_TIMEOUT_RATE?: string
  readonly VITE_MOCK_TIMEOUT_MODE?: string
  readonly VITE_MOCK_SEED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
