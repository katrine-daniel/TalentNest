// Captures README screenshots from the running demo. Skipped unless SCREENSHOTS=1:
//   SCREENSHOTS=1 npx playwright test screenshots --project desktop
import { expect, test } from '@playwright/test'
import { freshDemo } from './helpers'

test.skip(!process.env.SCREENSHOTS, 'Set SCREENSHOTS=1 to capture documentation screenshots')
test.use({ viewport: { width: 1440, height: 900 } })

const OUT = 'docs/screenshots'

test('documentation screenshots', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.screenshot({ path: `${OUT}/sign-in.png` })

  await freshDemo(page, 'Katrine Daniel')
  await page.screenshot({ path: `${OUT}/workspace.png` })

  const shots: Array<[string, string, (() => Promise<void>)?]> = [
    ['inbox', '/inbox'],
    ['requests', '/requests'],
    ['request-detail', '/requests/req_1043'],
    ['people', '/people'],
    ['employee', '/people/emp_008'],
    ['leave-calendar', '/leave?tab=team'],
    ['onboarding', '/lifecycle/lc_1'],
    ['policy', '/policies/pol_leave'],
    ['analytics', '/analytics'],
    ['automation', '/automation'],
    ['organization', '/organization?tab=requests'],
  ]
  for (const [name, route] of shots) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeAttached()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/${name}.png` })
  }

  await page.goto('/assistant')
  await page.getByLabel('Your question').fill('What is our annual leave policy on carry-over?')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByRole('link', { name: /Annual Leave Policy/ }).first()).toBeVisible()
  await page.screenshot({ path: `${OUT}/assistant.png` })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/mobile-workspace.png` })
})
