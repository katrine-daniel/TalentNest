import { expect, type Page } from '@playwright/test'

/** Starts from a fresh demo data set and signs in as `name`. */
export async function freshDemo(page: Page, name: string) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.goto('/')
  await signIn(page, name)
}

export async function signIn(page: Page, name: string) {
  await page.getByRole('button', { name: new RegExp(name) }).click()
  await expect(page.getByRole('button', { name: `Account menu for ${name}` })).toBeVisible()
}

/** Signs out of the demo account and signs in as someone else (demo data is kept). */
export async function switchTo(page: Page, name: string) {
  await page.getByRole('button', { name: /^Account menu for/ }).click()
  await page.getByRole('menuitem', { name: 'Switch demo account' }).click()
  await signIn(page, name)
}

/** Clicks the confirm button of the open dialog. */
export async function confirm(page: Page, label: string, note?: string) {
  const dialog = page.getByRole('dialog')
  if (note !== undefined) await dialog.getByRole('textbox').last().fill(note)
  await dialog.getByRole('button', { name: label, exact: true }).click()
  await expect(dialog).toBeHidden()
}
