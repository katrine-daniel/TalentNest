import { describe, expect, it, vi } from 'vitest'
import { dataStore } from '@/services/storage/dataStore'
import { createDemoDriver } from '@/services/storage/demoDriver'
import { createSupabaseDriver } from '@/services/storage/supabaseDriver'
import { diffCollection, fromRow, toCamel, toRow, toSnake } from '@/services/storage/rowMapping'
import { DEMO_STORAGE_KEY } from '@/config/env'
import { db, loadFreshDemo } from './helpers'

describe('row mapping', () => {
  it('converts keys between camelCase and snake_case', () => {
    expect(toSnake('experienceYears')).toBe('experience_years')
    expect(toCamel('experience_years')).toBe('experienceYears')
    const row = toRow({ id: 'c1', firstName: 'Ana', notes: [{ authorId: 'x' }] }, 'org-1')
    expect(row).toEqual({ org_id: 'org-1', id: 'c1', first_name: 'Ana', notes: [{ authorId: 'x' }] })
    expect(fromRow(row)).toEqual({ id: 'c1', firstName: 'Ana', notes: [{ authorId: 'x' }] })
  })

  it('diffs collections into upserts and deletes', () => {
    const a = { id: 'a', v: 1 }
    const b = { id: 'b', v: 1 }
    const { upserts, deletes } = diffCollection([a, b], [a, { id: 'b', v: 2 }, { id: 'c', v: 1 }])
    expect(upserts.map((r) => r.id)).toEqual(['b', 'c'])
    expect(deletes).toEqual([])
    expect(diffCollection([a, b], [a]).deletes).toEqual(['b'])
    // Structurally equal copies are not re-sent.
    expect(diffCollection([a], [{ ...a }]).upserts).toEqual([])
  })
})

describe('demo persistence', () => {
  it('persists writes to localStorage and restores them after a reload', async () => {
    await loadFreshDemo()
    const first = db().candidates[0]!
    dataStore.write('candidates', (list) => list.map((c) => (c.id === first.id ? { ...c, firstName: 'Persisted' } : c)))
    await dataStore.flush()
    expect(JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) ?? '{}').candidates[0].firstName).toBe('Persisted')

    // Simulate a page reload: a brand-new driver reads the stored data.
    await dataStore.connect(createDemoDriver({ latencyMs: 0 }), { force: true })
    expect(db().candidates.find((c) => c.id === first.id)?.firstName).toBe('Persisted')
  })

  it('reset restores the sample data', async () => {
    await loadFreshDemo()
    dataStore.write('candidates', () => [])
    await dataStore.reset()
    expect(db().candidates.length).toBeGreaterThan(10)
  })

  it('reports background write failures', async () => {
    const failing = { kind: 'demo' as const, load: async () => (await createDemoDriver({ latencyMs: 0 }).load()), persist: async () => Promise.reject(new Error('offline')) }
    await dataStore.connect(failing, { force: true })
    const onError = vi.fn()
    const off = dataStore.onPersistError(onError)
    dataStore.write('tasks', (l) => [...l])
    dataStore.write('tasks', (l) => l.slice(1))
    await dataStore.flush()
    off()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'offline' }), 'tasks')
  })
})

/** Minimal fake of the Supabase query builder that records calls. */
function fakeSupabase(tables: Record<string, Record<string, unknown>[]> = {}) {
  const calls: Array<{ table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> }> = []
  const from = (table: string) => {
    const call = { table, op: 'select', payload: undefined as unknown, filters: [] as Array<[string, unknown]> }
    const builder = {
      select: () => builder,
      upsert: (payload: unknown) => ((call.op = 'upsert'), (call.payload = payload), builder),
      update: (payload: unknown) => ((call.op = 'update'), (call.payload = payload), builder),
      delete: () => ((call.op = 'delete'), builder),
      eq: (k: string, v: unknown) => (call.filters.push([k, v]), builder),
      in: (k: string, v: unknown) => (call.filters.push([k, v]), builder),
      limit: () => builder,
      then: (resolve: (r: { data: unknown; error: null }) => void) => {
        calls.push(call)
        resolve({ data: call.op === 'select' ? (tables[table] ?? []) : null, error: null })
      },
    }
    return builder
  }
  return { client: { from } as never, calls }
}

describe('supabase driver', () => {
  it('seeds starter templates (never sample candidates) for a new organization', async () => {
    const { client, calls } = fakeSupabase({ org_members: [{ user_id: 'u1', full_name: 'Owner', email: 'o@x.test', title: null, role: 'Admin', department_id: null, status: 'active' }] })
    const data = await createSupabaseDriver({ client, orgId: 'org-1', userId: 'u1' }).load()
    expect(data.candidates).toEqual([])
    expect(data.jobs).toEqual([])
    expect(data.workflowTemplates.length).toBeGreaterThan(0)
    expect(data.users[0]).toMatchObject({ id: 'u1', role: 'Admin' })
    const seeded = calls.filter((c) => c.op === 'upsert').map((c) => c.table)
    expect(seeded).toEqual(expect.arrayContaining(['workflow_templates', 'scorecard_templates', 'onboarding_templates', 'automation_rules', 'org_settings']))
  })

  it('writes only changed rows, scoped to the organization', async () => {
    const { client, calls } = fakeSupabase()
    const driver = createSupabaseDriver({ client, orgId: 'org-9', userId: 'u1' })
    const a = { id: 't1', title: 'A' }
    const b = { id: 't2', title: 'B' }
    await driver.persist('tasks', [a, b] as never, [a, { ...b, title: 'B2' }] as never)
    await driver.persist('tasks', [a, b] as never, [a] as never)
    const upsert = calls.find((c) => c.op === 'upsert')
    expect(upsert?.table).toBe('tasks')
    expect(upsert?.payload).toEqual([{ org_id: 'org-9', id: 't2', title: 'B2' }])
    const del = calls.find((c) => c.op === 'delete')
    expect(del?.filters).toEqual([
      ['org_id', 'org-9'],
      ['id', ['t2']],
    ])
  })
})
