// Scheduled automation checks (Supabase Edge Function, Deno).
//
// UNTESTED against a live deployment — review before production use.
//
// Event-driven rules run in the browser of the person making a change. Time-based rules
// ("feedback.overdue") need something that runs without a browser: schedule this function
// (e.g. hourly with pg_cron + pg_net, see docs/deployment.md). It is called with the
// service-role key, never from the browser.
//
// Scope: evaluates enabled `feedback.overdue` rules and applies their `notify` and
// `create_task` actions. Each rule acts at most once per interview (dedupe via automation_runs).
import { adminClient, json } from '../_shared/auth.ts'

const HOUR = 3_600_000
type Row = Record<string, any>

function conditionMatches(c: { field: string; operator: string; value: string }, ctx: Record<string, unknown>) {
  const actual = ctx[c.field]
  if (actual === null || actual === undefined) return false
  const a = String(actual).toLowerCase()
  const e = c.value.trim().toLowerCase()
  switch (c.operator) {
    case 'equals': return a === e
    case 'not_equals': return a !== e
    case 'contains': return a.includes(e)
    case 'gte': return Number(actual) >= Number(c.value)
    case 'lte': return Number(actual) <= Number(c.value)
    default: return false
  }
}

const resolveUser = (target: string, job: Row | undefined) => (target === 'recruiter' ? job?.recruiter_id : target === 'hiring_manager' ? job?.hiring_manager_id : target) ?? null

Deno.serve(async (req) => {
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (req.headers.get('Authorization') !== `Bearer ${secret}`) return json({ error: 'Forbidden' }, 403)

  const db = adminClient()
  const { data: rules } = await db.from('automation_rules').select('*').eq('trigger', 'feedback.overdue').eq('enabled', true)
  let applied = 0

  for (const rule of (rules ?? []) as Row[]) {
    const org = rule.org_id
    const [{ data: interviews }, { data: feedback }, { data: jobs }, { data: candidates }, { data: runs }] = await Promise.all([
      db.from('interviews').select('*').eq('org_id', org).eq('status', 'completed'),
      db.from('interview_feedback').select('interview_id, interviewer_id').eq('org_id', org).eq('status', 'submitted'),
      db.from('jobs').select('id, title, department_id, recruiter_id, hiring_manager_id').eq('org_id', org),
      db.from('candidates').select('id, first_name, last_name, source, experience_years').eq('org_id', org),
      db.from('automation_runs').select('detail').eq('org_id', org).eq('rule_id', rule.id),
    ])
    const done = new Set((runs ?? []).map((r: Row) => r.detail))

    for (const iv of (interviews ?? []) as Row[]) {
      const submitted = new Set((feedback ?? []).filter((f: Row) => f.interview_id === iv.id).map((f: Row) => f.interviewer_id))
      if ((iv.interviewer_ids as string[]).every((id) => submitted.has(id))) continue
      const key = `${rule.id}:feedback.overdue:${iv.id}`
      if (done.has(key)) continue

      const job = (jobs ?? []).find((j: Row) => j.id === iv.job_id)
      const cand = (candidates ?? []).find((c: Row) => c.id === iv.candidate_id)
      const ctx = {
        'job.departmentId': job?.department_id,
        'job.title': job?.title,
        'candidate.source': cand?.source,
        'candidate.experienceYears': cand?.experience_years,
        hoursOverdue: Math.floor((Date.now() - new Date(iv.start).getTime()) / HOUR),
      }
      if (!(rule.conditions as Row[]).every((c) => conditionMatches(c as never, ctx))) continue

      const name = cand ? `${cand.first_name} ${cand.last_name}` : 'the candidate'
      const fill = (t: string) => t.replaceAll('{candidate}', name).replaceAll('{job}', job?.title ?? 'the vacancy').replaceAll('{stage}', iv.stage_name ?? 'the stage')
      const now = new Date().toISOString()
      const descriptions: string[] = []
      for (const action of rule.actions as Row[]) {
        if (action.type === 'notify') {
          await db.from('notifications').insert({ org_id: org, id: crypto.randomUUID(), type: 'automation', title: rule.name, body: fill(action.message), at: now, read: false, link: '/calendar', user_id: resolveUser(action.userId, job) })
          descriptions.push(`Notified: ${fill(action.message)}`)
        } else if (action.type === 'create_task') {
          const due = new Date(Date.now() + Number(action.dueInDays) * 24 * HOUR).toISOString()
          await db.from('tasks').upsert(
            { org_id: org, id: crypto.randomUUID(), title: fill(action.title), assignee_id: resolveUser(action.assignTo, job), due_date: due, status: 'open', candidate_id: iv.candidate_id, application_id: iv.application_id, created_by_id: null, created_at: now, source_key: key },
            { onConflict: 'org_id,source_key', ignoreDuplicates: true },
          )
          descriptions.push(`Task: ${fill(action.title)}`)
        }
      }
      await db.from('automation_runs').insert({ org_id: org, id: crypto.randomUUID(), rule_id: rule.id, rule_name: rule.name, trigger: 'feedback.overdue', entity_id: iv.id, at: now, status: 'success', detail: key, actions: descriptions })
      applied++
    }
  }
  return json({ applied })
})
