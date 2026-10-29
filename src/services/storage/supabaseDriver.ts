/**
 * Supabase persistence driver.
 *
 * Loads every collection for the signed-in user's organization and writes changes
 * back as row-level upserts/deletes. Row Level Security (supabase/migrations)
 * guarantees a user can only read or write rows of organizations they belong to —
 * the `org_id` sent from the browser is checked by the database, not trusted.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Candidate, CandidateNote, CollectionName, Database, OrgSettings, User } from '@/types/domain'
import { createOrgDefaults } from '@/data/orgDefaults'
import { SEED_VERSION } from '@/data/seed'
import { TABLES, diffCollection, fromRow, toRow } from './rowMapping'
import type { PersistenceDriver } from './dataStore'

type TableCollection = keyof typeof TABLES

interface MemberRow {
  user_id: string
  full_name: string | null
  email: string
  title: string | null
  role: User['role']
  department_id: string | null
  status: User['status']
}

function memberToUser(m: MemberRow): User {
  return { id: m.user_id, name: m.full_name || m.email, email: m.email, title: m.title ?? '', role: m.role, departmentId: m.department_id, status: m.status }
}

async function unwrap<T>(promise: PromiseLike<{ data: T | null; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await promise
  if (error) throw new Error(`Could not ${what}: ${error.message}`)
  return data as T
}

export function createSupabaseDriver({ client, orgId, userId }: { client: SupabaseClient; orgId: string; userId: string }): PersistenceDriver {
  async function seedDefaults(collection: TableCollection, rows: Array<{ id: string }>) {
    if (!rows.length) return
    await unwrap(client.from(TABLES[collection]).upsert(rows.map((r) => toRow(r, orgId))), `initialise ${collection}`)
  }

  return {
    kind: 'supabase',

    async load() {
      const collections = Object.keys(TABLES) as TableCollection[]
      const results = await Promise.all(
        collections.map((c) => unwrap(client.from(TABLES[c]).select('*').eq('org_id', orgId), `load ${c}`) as Promise<Record<string, unknown>[]>),
      )
      const data = Object.fromEntries(collections.map((c, i) => [c, (results[i] ?? []).map((row) => fromRow(row))])) as Record<TableCollection, unknown[]>

      // Restricted notes are stored apart from candidates so RLS can hide them; it returns
      // rows only to roles holding `candidates.notes.restricted`.
      const restricted = (await unwrap(
        client.from('candidate_restricted_notes').select('candidate_id, note').eq('org_id', orgId),
        'load restricted notes',
      )) as Array<{
        candidate_id: string
        note: CandidateNote
      }>
      if (restricted.length) {
        const byCandidate = new Map<string, Array<{ note: CandidateNote }>>()
        for (const r of restricted) byCandidate.set(r.candidate_id, [...(byCandidate.get(r.candidate_id) ?? []), r])
        data.candidates = (data.candidates as Candidate[]).map((c) => {
          const extra = byCandidate.get(c.id)
          return extra ? { ...c, notes: [...c.notes, ...extra.map((r) => r.note)].sort((a, b) => b.at.localeCompare(a.at)) } : c
        })
      }

      const members = await unwrap(client.from('org_members').select('*').eq('org_id', orgId), 'load members')
      const settingsRows = await unwrap(client.from('org_settings').select('*').eq('org_id', orgId).limit(1), 'load settings')

      // A new organization gets starter templates (never sample candidates).
      const defaults = createOrgDefaults(userId)
      for (const c of ['workflowTemplates', 'assessmentTemplates', 'scorecards', 'onboardingTemplates', 'automationRules'] as const) {
        if (data[c].length === 0) {
          await seedDefaults(c, defaults[c])
          data[c] = defaults[c]
        }
      }

      let settings: OrgSettings
      const settingsRow = (settingsRows as Array<Record<string, unknown>>)[0]
      if (settingsRow) {
        settings = {
          rolePermissions: settingsRow.role_permissions as OrgSettings['rolePermissions'],
          notificationPrefs: settingsRow.notification_prefs as OrgSettings['notificationPrefs'],
        }
      } else {
        settings = defaults.settings
        await unwrap(
          client.from('org_settings').upsert({ org_id: orgId, role_permissions: settings.rolePermissions, notification_prefs: settings.notificationPrefs }),
          'initialise settings',
        )
      }

      // Newest-first ordering for feeds.
      const byAtDesc = (a: { at: string }, b: { at: string }) => b.at.localeCompare(a.at)
      ;(data.activities as Array<{ at: string }>).sort(byAtDesc)
      ;(data.notifications as Array<{ at: string }>).sort(byAtDesc)
      ;(data.automationRuns as Array<{ at: string }>).sort(byAtDesc)

      return {
        version: SEED_VERSION,
        ...(data as unknown as Omit<Database, 'version' | 'users' | 'settings'>),
        users: (members as MemberRow[]).map(memberToUser),
        settings,
      }
    },

    async persist(collection: CollectionName, prev, next) {
      if (collection === 'settings') {
        const s = next as OrgSettings
        await unwrap(
          client.from('org_settings').upsert({ org_id: orgId, role_permissions: s.rolePermissions, notification_prefs: s.notificationPrefs }),
          'save settings',
        )
        return
      }
      if (collection === 'users') {
        // Membership changes (role / status / department) are authorised by RLS: admins only.
        const { upserts } = diffCollection(prev as User[], next as User[])
        for (const u of upserts) {
          await unwrap(
            client.from('memberships').update({ role: u.role, status: u.status, department_id: u.departmentId }).eq('org_id', orgId).eq('user_id', u.id),
            'update member',
          )
        }
        return
      }
      const table = TABLES[collection as TableCollection]
      const { upserts, deletes } = diffCollection(prev as Array<{ id: string }>, next as Array<{ id: string }>)
      if (upserts.length) await unwrap(client.from(table).upsert(upserts.map((r) => toRow(r, orgId))), `save ${collection}`)
      if (deletes.length) await unwrap(client.from(table).delete().eq('org_id', orgId).in('id', deletes), `delete ${collection}`)
    },
  }
}
