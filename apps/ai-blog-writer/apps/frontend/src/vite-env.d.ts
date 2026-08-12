/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_CONVERTER_URL?: string
  readonly VITE_FRONTEND_URL?: string
  readonly VITE_PAYLOAD_API_URL?: string
  readonly VITE_SCHEMA_SITE_NAME?: string
  readonly VITE_SCHEMA_PUBLISHER_LOGO_URL?: string
  readonly VITE_SCHEMA_DEFAULT_AUTHOR_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
