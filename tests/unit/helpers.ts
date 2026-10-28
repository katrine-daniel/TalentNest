import { dataStore } from '@/services/storage/dataStore'
import { createDemoDriver } from '@/services/storage/demoDriver'
import { fileStorage } from '@/services/storage/fileStorage'
import { installAutomation } from '@/features/automation/automationService'
import type { Database } from '@/types/domain'

/** Loads a fresh, isolated copy of the demo data set (no latency, no persisted state). */
export async function loadFreshDemo(): Promise<Database> {
  localStorage.clear()
  fileStorage.useDemo()
  installAutomation()
  await dataStore.connect(createDemoDriver({ latencyMs: 0 }), { force: true })
  const data = dataStore.getSnapshot().data
  if (!data) throw new Error('demo data failed to load')
  return data
}

export const db = () => dataStore.getSnapshot().data as Database

export const ADMIN = 'usr-01'
export const RECRUITER = 'usr-02'
export const INTERVIEWER = 'usr-09'
