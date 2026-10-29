// Runtime configuration. Only public VITE_* values are read here — this module must never
// contain or read private secrets.

function url(name: string, value: string | undefined): string {
  if (!value) return ''
  try {
    return new URL(value).toString().replace(/\/$/, '')
  } catch {
    console.warn(`[config] ${name} is not a valid URL and is ignored.`)
    return ''
  }
}

const raw = import.meta.env

export const env = {
  productName: raw.VITE_PRODUCT_NAME?.trim() || 'PeopleOS',
  productTagline: raw.VITE_PRODUCT_TAGLINE?.trim() || 'The intelligent workspace for people operations.',
  supabaseUrl: url('VITE_SUPABASE_URL', raw.VITE_SUPABASE_URL),
  supabaseAnonKey: raw.VITE_SUPABASE_ANON_KEY?.trim() ?? '',
  assistantUrl: url('VITE_ASSISTANT_URL', raw.VITE_ASSISTANT_URL),
} as const

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey)

if (Boolean(env.supabaseUrl) !== Boolean(env.supabaseAnonKey)) {
  console.warn('[config] Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use Supabase; running the demo workspace.')
}

export const STORAGE_KEYS = {
  demoData: 'peopleos.demo.v1',
  demoSession: 'peopleos.session.v1',
  ui: 'peopleos.ui.v1',
} as const
