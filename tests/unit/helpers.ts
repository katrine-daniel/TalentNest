import { createDemoDriver } from '@/services/demoDriver'
import { store } from '@/services/store'
import { installAutomation } from '@/services/automation'
import type { Account, Database } from '@/domain/types'

/** Loads a fresh copy of the demo data into the store. */
export async function freshDemo(): Promise<Database> {
  localStorage.clear()
  installAutomation({ scheduleInBrowser: false })
  await store.connect(createDemoDriver())
  return store.db
}

export const account = (id: string): Account => {
  const a = store.db.accounts.find((x) => x.id === id)
  if (!a) throw new Error(`no account ${id}`)
  return a
}

export const HR_ADMIN = 'acc_emp_001' // Katrine Daniel
export const HR = 'acc_emp_002' // Marcus Chen
export const MANAGER = 'acc_emp_007' // Elena Rossi (Front Office)
export const EMPLOYEE = 'acc_emp_008' // Samuel Okoye, reports to Elena
export const ORG_ADMIN = 'acc_emp_004' // Aisha Rahman
