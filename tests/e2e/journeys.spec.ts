import { expect, test } from '@playwright/test'
import { confirm, freshDemo, switchTo } from './helpers'

const isoInDays = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test('1 · employee request → manager approval → HR resolution, with history', async ({ page }) => {
  await freshDemo(page, 'Samuel Okoye')
  await page.goto('/requests/new')
  await page.getByRole('radio', { name: /Equipment request or replacement/ }).click()
  await page.getByLabel('Subject').fill('E2E replacement keyboard')
  await page.getByRole('button', { name: 'Submit request' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'E2E replacement keyboard' })).toBeVisible()
  await expect(page.getByText('Pending approval').first()).toBeVisible()
  const requestUrl = new URL(page.url()).pathname

  await switchTo(page, 'Elena Rossi')
  await page.goto('/inbox?filter=approvals')
  const item = page.getByRole('listitem').filter({ hasText: 'E2E replacement keyboard' })
  await item.getByRole('button', { name: 'Approve' }).click()
  await confirm(page, 'Approve')
  await expect(page.getByRole('listitem').filter({ hasText: 'E2E replacement keyboard' })).toHaveCount(0)

  await switchTo(page, 'Marcus Chen')
  await page.goto(requestUrl)
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Assign to me' }).click()
  await page.getByRole('button', { name: 'Resolve' }).click()
  await confirm(page, 'Resolve', 'Keyboard delivered to the front desk')
  await expect(page.getByText('Resolved', { exact: true }).first()).toBeVisible()
  const activity = page.getByRole('region', { name: /Conversation & activity/ }).or(page.locator('section', { hasText: 'Conversation & activity' }))
  await expect(activity.getByText(/Approved by Elena Rossi/)).toBeVisible()
  await expect(activity.getByText(/Assigned to Marcus Chen/)).toBeVisible()
})

test('2 · HR adds a joiner; onboarding starts and tasks reach the manager’s inbox', async ({ page }) => {
  await freshDemo(page, 'Katrine Daniel')
  await page.goto('/people?new=1')
  const drawer = page.getByRole('dialog', { name: 'Add employee' })
  await drawer.getByLabel('First name').fill('Noa')
  await drawer.getByLabel('Last name').fill('Testerson')
  await drawer.getByLabel('Work email').fill(`noa.${Date.now()}@harborpine.example`)
  await drawer.getByLabel('Job title').fill('Guest Services Agent')
  await drawer.getByLabel('Department').selectOption({ label: 'Front Office' })
  await drawer.getByLabel('Manager').selectOption({ label: 'Elena Rossi — Front Office Manager' })
  await drawer.getByLabel('Location').selectOption({ label: 'Harbor Hotel' })
  await drawer.getByLabel('Joining date').fill(isoInDays(14))
  await drawer.getByRole('button', { name: 'Create employee' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Noa Testerson' })).toBeVisible()

  await page.goto('/lifecycle?')
  await expect(page.getByRole('link', { name: 'Noa Testerson' })).toBeVisible()

  await switchTo(page, 'Elena Rossi')
  await page.goto('/inbox?filter=checklists')
  await expect(page.getByRole('listitem').filter({ hasText: 'Noa Testerson' }).first()).toBeVisible()
})

test('3 · assistant answers a policy question with a real source, or says it cannot', async ({ page }) => {
  await freshDemo(page, 'Katrine Daniel')
  await page.goto('/assistant')
  await expect(page.getByText(/Demo mode — rule-based retrieval, not AI/)).toBeVisible()
  await page.getByLabel('Your question').fill('What is our annual leave carry over policy?')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  const source = page.getByRole('link', { name: /Annual Leave Policy/ }).first()
  await expect(source).toBeVisible()
  await expect(source).toContainText(/v2 · effective/)
  await source.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Annual Leave Policy' })).toBeVisible()

  await page.goto('/assistant')
  await page.getByLabel('Your question').fill('What is the policy on company cars for pets?')
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByText(/couldn't find a published policy/)).toBeVisible()
})

test('4 · approving leave in the inbox updates the record, history, inbox and analytics', async ({ page }) => {
  await freshDemo(page, 'Katrine Daniel')
  await page.goto('/analytics')
  const before = Number(
    (
      await page
        .getByText(/\d+ decisions/)
        .first()
        .innerText()
    ).match(/\d+/)?.[0],
  )

  await switchTo(page, 'Elena Rossi')
  await page.goto('/inbox?filter=approvals')
  const item = page.getByRole('listitem').filter({ hasText: 'Samuel Okoye' }).filter({ hasText: 'Annual leave' })
  const link = item.getByRole('link').first()
  const href = await link.getAttribute('href')
  await item.getByRole('button', { name: 'Approve' }).click()
  await confirm(page, 'Approve')
  await expect(page.getByRole('listitem').filter({ hasText: 'Samuel Okoye' }).filter({ hasText: 'Annual leave' })).toHaveCount(0)

  await page.goto(href!.replace(/^.*?(\/leave\/)/, '$1'))
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/Approved by Elena Rossi/)).toBeVisible()

  await switchTo(page, 'Katrine Daniel')
  await page.goto('/analytics')
  await expect(page.getByText(new RegExp(`${before + 1} decisions`))).toBeVisible()
})

test('5 · an employee is denied restricted pages, data and records', async ({ page }) => {
  await freshDemo(page, 'Samuel Okoye')
  await expect(page.getByRole('link', { name: 'Workforce Analytics' })).toHaveCount(0)
  await page.goto('/analytics')
  await expect(page.getByText('You don’t have access to this page')).toBeVisible()
  await page.goto('/organization')
  await expect(page.getByText('You don’t have access to this page')).toBeVisible()
  await page.goto('/people/emp_009')
  await expect(page.getByRole('heading', { level: 1, name: 'Beatriz Lopes' })).toBeVisible()
  await expect(page.getByText('Restricted').first()).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Documents' })).toHaveCount(0)
  await page.goto('/requests/req_1042') // Kenji's payroll question
  await expect(page.getByText('Request not found')).toBeVisible()
})

test('command palette and skip link work from the keyboard', async ({ page }) => {
  await freshDemo(page, 'Katrine Daniel')
  await page.keyboard.press('Control+k')
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible()
  await page.keyboard.type('annual leave')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: 'Annual Leave Policy' })).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
})
