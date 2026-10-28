// Central runtime configuration. Only VITE_* variables reach the browser, so this
// module must never read or embed private secrets (service-role keys, AI provider keys).

function optionalUrl(name: string, value: string | undefined): string {
  if (!value) return ''
  try {
    new URL(value)
    return value.replace(/\/$/, '')
  } catch {
    console.warn(`[config] ${name} is not a valid URL and will be ignored.`)
    return ''
  }
}

const raw = import.meta.env

export const env = {
  apiBaseUrl: optionalUrl('VITE_API_BASE_URL', raw.VITE_API_BASE_URL),
  aiProxyUrl: optionalUrl('VITE_AI_PROXY_URL', raw.VITE_AI_PROXY_URL),
  supabaseUrl: optionalUrl('VITE_SUPABASE_URL', raw.VITE_SUPABASE_URL),
  supabaseAnonKey: raw.VITE_SUPABASE_ANON_KEY ?? '',
  useMockApi: (raw.VITE_USE_MOCK_API ?? 'true') !== 'false',
} as const

if ((env.supabaseUrl && !env.supabaseAnonKey) || (!env.supabaseUrl && env.supabaseAnonKey)) {
  console.warn('[config] Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable the Supabase backend.')
}

// Demo persistence lives in localStorage and is strictly for the demo workspace.
export const DEMO_STORAGE_KEY = 'talentnest.demo-data.v1'
export const DEMO_SESSION_KEY = 'talentnest.demo-session.v1'
export const UI_PREFS_KEY = 'talentnest.ui-prefs.v1'
export const THEME_KEY = 'talentnest.theme.v1'
