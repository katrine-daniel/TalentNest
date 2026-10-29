/**
 * Supabase persistence driver.
 *
 * Each collection is a table of `(org_id, id, data jsonb)`; the migration derives the columns its
 * row-level-security policies need (e.g. requester, employee, assignee) from `data`. Parts of a record
 * that fewer people may read live in their own tables with stricter policies:
 *   - employees.personalEmail/phone/dateOfBirth/emergencyContact → employee_private
 *   - employees.documents/equipment/history                      → employee_records
 *   - internal comments on requests                             → request_internal_notes
 * Rows a user may not read are simply absent; the database rejects writes the user may not make.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Account, Collection, Database, Employee, HRRequest, Organization, RequestComment } from '@/domain/types'
import { SEED_VERSION } from '@/data/seed'
import { ServiceError, type PersistenceDriver } from './store'

export const TABLES: Record<Exclude<Collection, 'accounts'>, string> = {
  departments: 'departments',
  teams: 'teams',
  locations: 'locations',
  employmentTypes: 'employment_types',
  schedules: 'work_schedules',
  holidays: 'holidays',
  employees: 'employees',
  requestTypes: 'request_types',
  requests: 'hr_requests',
  leaveTypes: 'leave_types',
  leaveRequests: 'leave_requests',
  leaveAdjustments: 'leave_adjustments',
  lifecycleTemplates: 'lifecycle_templates',
  lifecycleCases: 'lifecycle_cases',
  tasks: 'tasks',
  policies: 'policies',
  policyAcks: 'policy_acknowledgments',
  announcements: 'announcements',
  rules: 'workflow_rules',
  runs: 'workflow_runs',
  notifications: 'notifications',
  notificationPrefs: 'notification_preferences',
  inboxState: 'inbox_state',
  audit: 'audit_events',
  conversations: 'assistant_conversations',
}

/** Insert-only from the browser: never updated or deleted. */
const APPEND_ONLY = new Set<Collection>(['audit', 'policyAcks'])

export const PRIVATE_FIELDS = ['personalEmail', 'phone', 'dateOfBirth', 'emergencyContact'] as const
export const RECORD_FIELDS = ['documents', 'equipment', 'history'] as const

type Rec = { id: string } & Record<string, unknown>

const pick = (o: Rec, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, o[k] ?? null]))
const omit = (o: Rec, keys: readonly string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function diff<T extends { id: string }>(prev: readonly T[], next: readonly T[]) {
  const before = new Map(prev.map((r) => [r.id, r]))
  const ids = new Set(next.map((r) => r.id))
  return {
    upserts: next.filter((r) => {
      const b = before.get(r.id)
      return !b || (b !== r && !same(b, r))
    }),
    deletes: prev.filter((r) => !ids.has(r.id)).map((r) => r.id),
  }
}

/** Splits an employee into the public directory row and its two restricted parts. */
export function splitEmployee(e: Employee) {
  const rec = e as unknown as Rec
  return { pub: omit(rec, [...PRIVATE_FIELDS, ...RECORD_FIELDS, 'id']), priv: pick(rec, PRIVATE_FIELDS), records: pick(rec, RECORD_FIELDS) }
}

/** Joins the parts back. Parts the user cannot read are absent → empty values, never another person's data. */
export function joinEmployee(
  id: string,
  pub: Record<string, unknown>,
  priv: Record<string, unknown> | undefined,
  records: Record<string, unknown> | undefined,
): Employee {
  return {
    personalEmail: null,
    phone: null,
    dateOfBirth: null,
    emergencyContact: null,
    documents: [],
    equipment: [],
    history: [],
    ...pub,
    ...(priv ?? {}),
    ...(records ?? {}),
    id,
  } as unknown as Employee
}

async function check<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p
  if (error) throw new ServiceError(`Could not ${what}: ${error.message}`, 'unavailable')
  return data as T
}

export function createSupabaseDriver(client: SupabaseClient, orgId: string): PersistenceDriver {
  const rows = (table: string) => check(client.from(table).select('id, data').eq('org_id', orgId), `load ${table}`) as Promise<Array<{ id: string; data: Rec }>>
  const upsert = (table: string, list: Array<{ id: string; data: unknown }>) =>
    list.length
      ? check(
          client.from(table).upsert(
            list.map((r) => ({ org_id: orgId, id: r.id, data: r.data })),
            { onConflict: 'org_id,id' },
          ),
          `save ${table}`,
        )
      : Promise.resolve(null)
  const remove = (table: string, ids: string[]) =>
    ids.length ? check(client.from(table).delete().eq('org_id', orgId).in('id', ids), `delete from ${table}`) : Promise.resolve(null)

  return {
    kind: 'supabase',
    async load() {
      const names = Object.keys(TABLES) as Array<keyof typeof TABLES>
      const [org, members, priv, records, notes, ...loaded] = await Promise.all([
        check(client.from('organizations').select('*').eq('id', orgId).single(), 'load the organization'),
        check(client.from('org_members').select('*').eq('org_id', orgId), 'load members'),
        rows('employee_private'),
        rows('employee_records'),
        rows('request_internal_notes'),
        ...names.map((n) => rows(TABLES[n])),
      ])
      const data = Object.fromEntries(names.map((n, i) => [n, (loaded[i] ?? []).map((r) => ({ ...r.data, id: r.id }))])) as Record<string, Rec[]>
      const privById = new Map(priv.map((r) => [r.id, r.data]))
      const recById = new Map(records.map((r) => [r.id, r.data]))
      data.employees = (data.employees ?? []).map((e) => joinEmployee(e.id, e, privById.get(e.id), recById.get(e.id)) as unknown as Rec)
      const notesByRequest = new Map<string, RequestComment[]>()
      for (const n of notes) {
        const { requestId, ...note } = n.data as unknown as RequestComment & { requestId: string }
        notesByRequest.set(requestId, [...(notesByRequest.get(requestId) ?? []), { ...note, id: n.id }])
      }
      data.requests = (data.requests ?? []).map((r) => {
        const extra = notesByRequest.get(r.id)
        return extra ? { ...r, comments: [...(r.comments as RequestComment[]), ...extra].sort((a, b) => a.at.localeCompare(b.at)) } : r
      })
      const accounts: Account[] = (members as Array<Record<string, unknown>>).map((m) => ({
        id: String(m.user_id),
        employeeId: (m.employee_id as string | null) ?? null,
        name: String(m.full_name || m.email),
        email: String(m.email),
        role: m.role as Account['role'],
        status: m.status as Account['status'],
      }))
      const o = org as unknown as Record<string, unknown>
      const organization: Organization = {
        id: String(o.id),
        name: String(o.name),
        industry: String(o.industry ?? ''),
        timezone: String(o.timezone ?? 'UTC'),
        country: String(o.country ?? ''),
        weekStartsOn: o.week_starts_on === 0 ? 0 : 1,
        terminology: (o.terminology as Organization['terminology']) ?? {
          employee: 'employee',
          employees: 'employees',
          department: 'department',
          location: 'location',
        },
      }
      return { version: SEED_VERSION, organization, accounts, ...(data as unknown as Omit<Database, 'version' | 'organization' | 'accounts'>) }
    },

    async persist(prev, next, changed) {
      for (const key of changed) {
        if (key === 'organization') {
          const o = next.organization
          await check(
            client
              .from('organizations')
              .update({
                name: o.name,
                industry: o.industry,
                timezone: o.timezone,
                country: o.country,
                week_starts_on: o.weekStartsOn,
                terminology: o.terminology,
              })
              .eq('id', orgId),
            'save the organization',
          )
          continue
        }
        if (key === 'accounts') {
          // Role and status changes; RLS allows them for organization administrators only.
          for (const a of diff(prev.accounts, next.accounts).upserts)
            await check(client.from('memberships').update({ role: a.role, status: a.status }).eq('org_id', orgId).eq('user_id', a.id), 'update a member')
          continue
        }
        if (key === 'employees') {
          const before = new Map(prev.employees.map((e) => [e.id, splitEmployee(e)]))
          const { upserts, deletes } = diff(prev.employees, next.employees)
          const parts = upserts.map((e) => ({ id: e.id, now: splitEmployee(e), was: before.get(e.id) }))
          // Only the parts that changed are written, so a user never writes a part they cannot access.
          await upsert(
            'employees',
            parts.filter((p) => !p.was || !same(p.was.pub, p.now.pub)).map((p) => ({ id: p.id, data: p.now.pub })),
          )
          await upsert(
            'employee_private',
            parts.filter((p) => !p.was || !same(p.was.priv, p.now.priv)).map((p) => ({ id: p.id, data: p.now.priv })),
          )
          await upsert(
            'employee_records',
            parts.filter((p) => !p.was || !same(p.was.records, p.now.records)).map((p) => ({ id: p.id, data: p.now.records })),
          )
          await remove('employees', deletes)
          continue
        }
        if (key === 'requests') {
          const { upserts, deletes } = diff(prev.requests, next.requests)
          const prevNotes = new Set(prev.requests.flatMap((r) => r.comments.filter((c) => c.internal).map((c) => c.id)))
          const publicRows = upserts.map((r: HRRequest) => ({
            id: r.id,
            data: { ...omit(r as unknown as Rec, ['id']), comments: r.comments.filter((c) => !c.internal) },
          }))
          const newNotes = upserts.flatMap((r) =>
            r.comments
              .filter((c) => c.internal && !prevNotes.has(c.id))
              .map((c) => ({ id: c.id, data: { ...omit(c as unknown as Rec, ['id']), requestId: r.id } })),
          )
          await upsert('hr_requests', publicRows)
          await upsert('request_internal_notes', newNotes)
          await remove('hr_requests', deletes)
          continue
        }
        const table = TABLES[key]
        const { upserts, deletes } = diff(prev[key] as unknown as Rec[], next[key] as unknown as Rec[])
        if (APPEND_ONLY.has(key)) {
          const known = new Set((prev[key] as unknown as Rec[]).map((r) => r.id))
          const inserts = upserts.filter((r) => !known.has(r.id))
          if (inserts.length) await check(client.from(table).insert(inserts.map((r) => ({ org_id: orgId, id: r.id, data: omit(r, ['id']) }))), `save ${key}`)
          continue
        }
        await upsert(
          table,
          upserts.map((r) => ({ id: r.id, data: omit(r, ['id']) })),
        )
        await remove(table, deletes)
      }
    },
  }
}
