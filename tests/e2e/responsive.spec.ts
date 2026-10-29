import { expect, test } from '@playwright/test'
import { freshDemo } from './helpers'

const ROUTES = [
  '/',
  '/assistant',
  '/inbox',
  '/people',
  '/people/emp_008',
  '/requests',
  '/requests/new',
  '/requests/req_1040',
  '/leave',
  '/leave?tab=team',
  '/leave/new',
  '/lifecycle',
  '/lifecycle/lc_1',
  '/policies',
  '/policies/pol_leave',
  '/analytics',
  '/automation',
  '/organization?tab=requests',
  '/integrations',
  '/settings',
]

test('every main route renders without errors or horizontal scrolling', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  await freshDemo(page, 'Katrine Daniel')
  for (const route of ROUTES) {
    await page.goto(route)
    await expect(page.getByRole('heading', { level: 1 }).first(), route).toBeAttached()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `${route} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1)
  }
  expect(errors, errors.join('\n')).toEqual([])
})
