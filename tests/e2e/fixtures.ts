import { expect, type Page } from '@playwright/test'

/** Signs in to the demo workspace with one of the sample accounts. */
export async function enterDemo(page: Page, name = 'Katrine Daniel') {
  await page.goto('/login')
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('main')).toBeVisible()
}
