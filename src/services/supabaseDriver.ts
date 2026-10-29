/**
 * Supabase persistence driver.
 *
 * Every collection maps to a table with `org_id` + `id` and snake_case columns for the record's
 * top-level fields (nested values are jsonb). Loads read the organization's rows; writes send
 * only changed rows. Row-level security (supabase/migrations) decides what each user may read
 * and write — the browser cannot widen its own access.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Account, Collection, Database, Organization } from '@/domain/types'
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

/** Append-only tables: rows are inserted, never updated or deleted from the browser. */
const APPEND_ONLY = new Set<Collection>(['audit', 'runs', 'policyAcks'])

export const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
export const toCamel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())

export function toRow(record: object, orgId: string): Record<string, unknown> {
  const row: Record<string, unknown> = { org_id: orgId }
  for (const [k, v] of Object.entries(record)) row[toSnake(k)] = v === undefined ? null : v
  return row
}

export function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) if (k !== 'org_id') out[toCamel(k)] = v
  return out as T
}

export function diff<T extends { id: string }>(prev: readonly T[], next: readonly T[]) {
  const before = new Map(prev.map((r) => [r.id, r]))
  const ids = new Set(next.map((r) => r.id))
  return {
    upserts: next.filter((r) => {
      const b = before.get(r.id)
      return !b || (b !== r && JSON.stringify(b) !== JSON.stringify(r))
    }),
    deletes: prev.filter((r) => !ids.has(r.id)).map((r) => r.id),
  }
}

async function check<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p
  if (error) throw new ServiceError(`Could not ${what}: ${error.message}`, 'unavailable')
  return data as T
}

export function createSupabaseDriver(client: SupabaseClient, orgId: string): PersistenceDriver {
  return {
    kind: 'supabase',
    async load() {
      const names = Object.keys(TABLES) as Array<keyof typeof TABLES>
      const [org, members, ...rows] = await Promise.all([
        check(client.from('organizations').select('*').eq('id', orgId).single(), 'load the organization'),
        check(client.from('org_members').select('*').eq('org_id', orgId), 'load members'),
        ...names.map((n) => check(client.from(TABLES[n]).select('*').eq('org_id', orgId), `load ${n}`)),
      ])
      const data = Object.fromEntries(names.map((n, i) => [n, ((rows[i] as Array<Record<string, unknown>>) ?? []).map((r) => fromRow(r))]))
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
        weekStartsOn: (o.week_starts_on as 0 | 1) ?? 1,
        terminology: (o.terminology as Organization['terminology']) ?? {
          employee: 'employee',
          employees: 'employees',
          department: 'department',
          location: 'location',
        },
      }
      return { version: SEED_VERSION, organization, accounts, ...(data as Omit<Database, 'version' | 'organization' | 'accounts'>) }
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
          const { upserts } = diff(prev.accounts, next.accounts)
          for (const a of upserts)
            await check(client.from('memberships').update({ role: a.role, status: a.status }).eq('org_id', orgId).eq('user_id', a.id), 'update a member')
          continue
        }
        const table = TABLES[key]
        const { upserts, deletes } = diff(prev[key] as Array<{ id: string }>, next[key] as Array<{ id: string }>)
        if (APPEND_ONLY.has(key)) {
          const known = new Set((prev[key] as Array<{ id: string }>).map((r) => r.id))
          const inserts = upserts.filter((r) => !known.has(r.id))
          if (inserts.length) await check(client.from(table).insert(inserts.map((r) => toRow(r, orgId))), `save ${key}`)
          continue
        }
        if (upserts.length)
          await check(
            client.from(table).upsert(
              upserts.map((r) => toRow(r, orgId)),
              { onConflict: 'org_id,id' },
            ),
            `save ${key}`,
          )
        if (deletes.length) await check(client.from(table).delete().eq('org_id', orgId).in('id', deletes), `delete ${key}`)
      }
    },
  }
}
