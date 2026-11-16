/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API key CARTO Basemaps. Set di web/.env.production atau env build; jangan di-commit. */
  readonly VITE_CARTO_API_KEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
