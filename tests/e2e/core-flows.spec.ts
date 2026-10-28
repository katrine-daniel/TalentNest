import { expect, test } from '@playwright/test'
import { enterDemo } from './fixtures'

test.beforeEach(async ({ page }) => {
  await enterDemo(page)
})

test('unauthenticated users are sent to the sign-in page', async ({ page, context }) => {
  await context.clearCookies()
  await page.evaluate(() => localStorage.clear())
  await page.goto('/candidates')
  await expect(page).toHaveURL(/\/login/)
})

test('create a candidate and keep it after a reload', async ({ page }) => {
  const email = `e2e.${Date.now()}@example.com`
  await page.goto('/candidates')
  await page
    .getByRole('button', { name: /add candidate/i })
    .first()
    .click()
  const dialog = page.getByRole('dialog', { name: 'Add candidate' })
  await dialog.getByLabel('First name').fill('Test')
  await dialog.getByLabel('Last name').fill('Candidate')
  await dialog.getByLabel('Email').fill(email)
  await dialog.getByLabel('Total experience (years)').fill('3')
  await dialog.getByRole('button', { name: /AWS/ }).first().click()
  const recruiter = dialog.getByRole('combobox', { name: /^Recruiter/ })
  if (!(await recruiter.inputValue())) await recruiter.selectOption({ index: 1 })
  await dialog.getByRole('button', { name: 'Add candidate' }).click()
  await expect(dialog).toBeHidden()

  await page.reload()
  await page.goto('/candidates')
  await page.getByRole('searchbox').filter({ visible: true }).first().fill(email)
  await expect(page.getByText('Test Candidate').filter({ visible: true }).first()).toBeVisible()
})

test('approving a pending requisition updates its status', async ({ page }) => {
  await page.goto('/requisitions')
  await page.getByRole('tab', { name: /needs my approval/i }).click()
  await page.locator('[aria-label^="Open requisition"]').filter({ visible: true }).first().click()
  await page.getByRole('button', { name: 'Approve', exact: true }).first().click()
  const confirm = page.getByRole('dialog', { name: 'Approve this requisition?' })
  await confirm.getByRole('button', { name: 'Approve' }).click()
  await expect(confirm).toBeHidden()
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible()
})

test('rejecting a requisition requires a comment', async ({ page }) => {
  await page.goto('/requisitions')
  await page.getByRole('tab', { name: /needs my approval/i }).click()
  await page.locator('[aria-label^="Open requisition"]').filter({ visible: true }).first().click()
  await page.getByRole('button', { name: 'Reject', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Reject this requisition?' })
  await confirm.getByRole('button', { name: 'Reject' }).click()
  await expect(confirm.getByText('Comment is required')).toBeVisible()
})

test('command palette opens with Ctrl+K and navigates by keyboard', async ({ page }) => {
  await page.keyboard.press('Control+k')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  await page.keyboard.type('talent')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/talent/)
})

test('skip link moves focus to the main content', async ({ page }) => {
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
})
