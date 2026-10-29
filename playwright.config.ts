import { defineConfig, devices } from '@playwright/test'

// Locally you can reuse an installed browser instead of downloading one:
//   PLAYWRIGHT_CHANNEL=msedge npm run test:e2e   (or chrome)
// CI installs Playwright's Chromium (`npx playwright install --with-deps chromium`).
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined
const PORT = 4174

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    channel,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    // Force demo mode so tests never touch a real backend.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_AI_PROXY_URL: '' },
  },
})
