/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRODUCT_NAME?: string
  readonly VITE_PRODUCT_TAGLINE?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_ASSISTANT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
