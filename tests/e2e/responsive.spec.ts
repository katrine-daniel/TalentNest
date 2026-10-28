import { expect, test } from '@playwright/test'
import { enterDemo } from './fixtures'

const PAGES = ['/', '/candidates', '/jobs', '/pipeline', '/requisitions', '/talent', '/compare', '/onboarding', '/tasks', '/analytics', '/settings/users']

test('pages fit the viewport without horizontal scrolling', async ({ page }) => {
  await enterDemo(page)
  for (const path of PAGES) {
    await page.goto(path)
    await expect(page.getByRole('main')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1)
  }
})
