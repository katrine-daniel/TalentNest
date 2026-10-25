// Central place for runtime configuration. Only VITE_* variables are exposed to the browser,
// so this file must never read or embed private secrets.
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '',
  aiProxyUrl: import.meta.env.VITE_AI_PROXY_URL || '',
  useMockApi: (import.meta.env.VITE_USE_MOCK_API ?? 'true') !== 'false',
}

// Demo persistence lives in localStorage and is strictly for the mock layer.
// Production data must come from the backend; this key is never used when useMockApi is false.
export const DEMO_STORAGE_KEY = 'talentnest.demo-data.v1'
export const UI_PREFS_KEY = 'talentnest.ui-prefs.v1'
