/**
 * Demo assistant engine — deterministic retrieval and rules, NOT a language model.
 *
 * It answers from data the signed-in user is authorized to see:
 *  - policy questions: keyword retrieval over sections of published policy versions in the
 *    user's audience, quoting the matching section and citing title, version and effective date;
 *  - record questions (approvals, overdue onboarding, open requests, today's follow-ups, leave
 *    balance): computed from the same permission-filtered selectors the app uses.
 * When nothing relevant is found it says so instead of guessing.
 */
import { today } from '@/lib/dates'
import { fullName } from '@/lib/utils'
import { buildInbox } from './inbox'
import { leaveBalance } from './leave'
import { can, canViewRequest, isHR, reportIds } from './permissions'
import { isOpenRequest, isOverdue } from './sla'
import type { Account, AssistantCitation, AssistantMessage, Database, Policy } from './types'

const STOP = new Set(
  'a an and are as at be by can do does for from how i if in is it me my of on or our please should the this to we what when where which who why will with you your about any there their them get'.split(
    ' ',
  ),
)

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => t.replace(/(ies)$/, 'y').replace(/([^s])s$/, '$1'))
}

export interface PolicyChunk {
  policy: Policy
  version: number
  effectiveDate: string
  heading: string
  text: string
  tokens: string[]
}

export function policyChunks(policies: readonly Policy[]): PolicyChunk[] {
  const out: PolicyChunk[] = []
  for (const p of policies) {
    if (p.status !== 'published' || p.publishedVersion === null) continue
    const v = p.versions.find((x) => x.version === p.publishedVersion)
    if (!v) continue
    const sections = v.body.split(/\n(?=## )/)
    for (const s of sections) {
      const [first, ...rest] = s.split('\n')
      const heading = (first ?? '').replace(/^#+\s*/, '')
      const text = rest.join('\n').trim() || heading
      out.push({
        policy: p,
        version: v.version,
        effectiveDate: v.effectiveDate,
        heading,
        text,
        tokens: tokenize(`${p.title} ${p.tags.join(' ')} ${heading} ${text}`),
      })
    }
  }
  return out
}

export function searchPolicies(chunks: PolicyChunk[], question: string): Array<{ chunk: PolicyChunk; score: number; coverage: number }> {
  const q = [...new Set(tokenize(question))]
  if (!q.length) return []
  const df = new Map<string, number>()
  for (const c of chunks) for (const t of new Set(c.tokens)) df.set(t, (df.get(t) ?? 0) + 1)
  return chunks
    .map((chunk) => {
      const tf = new Map<string, number>()
      for (const t of chunk.tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
      let score = 0
      let matched = 0
      for (const t of q) {
        const f = tf.get(t) ?? 0
        if (!f) continue
        matched++
        const idf = Math.log(1 + chunks.length / (df.get(t) ?? 1))
        score += idf * (1 + Math.log(f))
        if (chunk.policy.tags.includes(t) || tokenize(chunk.policy.title).includes(t)) score += idf
        if (tokenize(chunk.heading).includes(t)) score += idf * 0.5
      }
      // Share of the question's terms found in the section — guards against single incidental matches.
      return { chunk, score, coverage: matched / q.length }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
}

const policyCitation = (c: PolicyChunk): AssistantCitation => ({
  kind: 'policy',
  label: `${c.policy.title} — ${c.heading}`,
  detail: `v${c.version} · effective ${c.effectiveDate}`,
  href: `/policies/${c.policy.id}`,
})

type Answer = Pick<AssistantMessage, 'text' | 'citations' | 'suggestions' | 'actions'>

function list(lines: string[], max = 6): string {
  const shown = lines.slice(0, max).map((l) => `• ${l}`)
  if (lines.length > max) shown.push(`…and ${lines.length - max} more`)
  return shown.join('\n')
}

export function answerDemo(db: Database, account: Account, question: string, visible: { policies: Policy[] }): Answer {
  const q = question.toLowerCase()
  const T = today()
  const empName = (id: string) => {
    const e = db.employees.find((x) => x.id === id)
    return e ? fullName(e) : 'Unknown'
  }

  // --- awaiting my approval
  if (/approv/.test(q) && /(await|pending|need|waiting|my|me)/.test(q)) {
    const items = buildInbox(db, account).filter((i) => ['leave_approval', 'request_approval', 'record_update'].includes(i.kind))
    if (!items.length)
      return {
        text: 'Nothing is waiting for your approval right now.',
        citations: [],
        suggestions: [],
        actions: [{ label: 'Open HR Inbox', href: '/inbox', requiresConfirmation: false }],
      }
    return {
      text: `${items.length} item${items.length === 1 ? ' is' : 's are'} waiting for your decision:\n${list(items.map((i) => `${i.title} — ${i.employee ? fullName(i.employee) : ''}${i.overdue ? ' (overdue)' : ''}`))}`,
      citations: items.slice(0, 6).map((i) => ({ kind: 'record', label: i.title, detail: i.context, href: i.href })),
      suggestions: items.some((i) => i.overdue) ? ['Start with the overdue items — the employee is already waiting past the target.'] : [],
      actions: [{ label: 'Review in HR Inbox', href: '/inbox?filter=approvals', requiresConfirmation: false }],
    }
  }

  // --- overdue onboarding / offboarding
  if (/overdue|late|behind/.test(q) && /onboard|offboard|checklist|lifecycle|new hire|joiner/.test(q)) {
    const team = reportIds(db.employees, account.employeeId)
    const cases = db.lifecycleCases.filter(
      (c) => c.status === 'active' && (can(account, 'lifecycle.manage') || team.has(c.employeeId) || c.tasks.some((t) => t.assigneeId === account.id)),
    )
    const overdue = cases.flatMap((c) =>
      c.tasks
        .filter((t) => t.status === 'open' && t.dueDate < T && (can(account, 'lifecycle.manage') || team.has(c.employeeId) || t.assigneeId === account.id))
        .map((t) => ({ c, t })),
    )
    if (!overdue.length) return { text: 'No onboarding or offboarding tasks you can see are overdue.', citations: [], suggestions: [], actions: [] }
    return {
      text: `${overdue.length} checklist task${overdue.length === 1 ? ' is' : 's are'} overdue:\n${list(overdue.map(({ c, t }) => `${t.title} — ${empName(c.employeeId)} (${c.kind}, due ${t.dueDate}, ${t.assigneeId ? (db.accounts.find((a) => a.id === t.assigneeId)?.name ?? 'assigned') : 'HR queue'})`))}`,
      citations: [...new Map(overdue.map(({ c }) => [c.id, c])).values()].slice(0, 6).map((c) => ({
        kind: 'record',
        label: `${c.kind === 'onboarding' ? 'Onboarding' : 'Offboarding'}: ${empName(c.employeeId)}`,
        detail: `key date ${c.keyDate}`,
        href: `/lifecycle/${c.id}`,
      })),
      suggestions: ['Reassign tasks whose owner is unavailable, or adjust the due date if the plan changed.'],
      actions: [{ label: 'Open onboarding & offboarding', href: '/lifecycle', requiresConfirmation: false }],
    }
  }

  // --- unresolved requests summary
  if (/request|ticket|case/.test(q) && /unresolved|open|outstanding|summar|status|pending/.test(q)) {
    const reqs = db.requests.filter((r) => canViewRequest(account, r, db) && isOpenRequest(r))
    if (!reqs.length) return { text: 'There are no unresolved requests you can see.', citations: [], suggestions: [], actions: [] }
    const overdue = reqs.filter((r) => isOverdue(r))
    const byStatus = new Map<string, number>()
    for (const r of reqs) byStatus.set(r.status.replace(/_/g, ' '), (byStatus.get(r.status.replace(/_/g, ' ')) ?? 0) + 1)
    const unassigned = isHR(account) ? reqs.filter((r) => !r.assigneeId && r.status !== 'pending_approval').length : 0
    return {
      text: `${reqs.length} unresolved request${reqs.length === 1 ? '' : 's'}: ${[...byStatus.entries()].map(([s, n]) => `${n} ${s}`).join(', ')}.${overdue.length ? ` ${overdue.length} past the service target.` : ''}${unassigned ? ` ${unassigned} unassigned.` : ''}\n${list(reqs.sort((a, b) => a.dueAt.localeCompare(b.dueAt)).map((r) => `${r.number} ${r.subject} — ${empName(r.employeeId)}${isOverdue(r) ? ' (overdue)' : ''}`))}`,
      citations: reqs
        .slice(0, 6)
        .map((r) => ({ kind: 'record', label: `${r.number} ${r.subject}`, detail: r.status.replace(/_/g, ' '), href: `/requests/${r.id}` })),
      suggestions: [
        overdue.length ? 'Pick up the overdue requests first.' : '',
        unassigned ? 'Assign the unassigned requests so each has an owner.' : '',
      ].filter(Boolean),
      actions: [{ label: 'Open the request queue', href: '/requests', requiresConfirmation: false }],
    }
  }

  // --- what to follow up on today
  if (/follow.?up|today|focus|priorit|what should i/.test(q)) {
    const items = buildInbox(db, account).filter((i) => i.overdue || (i.due && i.due.slice(0, 10) <= T))
    const all = buildInbox(db, account)
    const chosen = items.length ? items : all.slice(0, 5)
    if (!chosen.length) return { text: 'Your inbox is clear — nothing needs follow-up today.', citations: [], suggestions: [], actions: [] }
    return {
      text: `${items.length ? `${items.length} item${items.length === 1 ? ' is' : 's are'} overdue or due today` : 'Nothing is due today; your next items are'}:\n${list(chosen.map((i) => `${i.title}${i.employee ? ` — ${fullName(i.employee)}` : ''} (${i.overdue ? 'overdue' : i.status})`))}`,
      citations: chosen.slice(0, 6).map((i) => ({ kind: 'record', label: i.title, detail: i.context, href: i.href })),
      suggestions: ['Work through overdue items first, then approvals that block other people.'],
      actions: [{ label: 'Open HR Inbox', href: '/inbox', requiresConfirmation: false }],
    }
  }

  // --- my leave balance
  if (/balance|how many (days|holiday)|days (left|remaining)|leave left/.test(q)) {
    if (!account.employeeId)
      return { text: 'Your account is not linked to an employee record, so there is no leave balance to show.', citations: [], suggestions: [], actions: [] }
    const year = new Date().getFullYear()
    const rows = db.leaveTypes.filter((t) => t.tracked && t.active).map((t) => ({ t, b: leaveBalance(db, account.employeeId as string, t.id, year) }))
    return {
      text: `Your ${year} balances:\n${list(rows.map(({ t, b }) => (b ? `${t.name}: ${b.available} day(s) available (entitlement ${b.entitlement}${b.adjustments ? `, adjustments ${b.adjustments > 0 ? '+' : ''}${b.adjustments}` : ''}, taken ${b.taken}, pending ${b.pending})` : `${t.name}: not tracked`)))}`,
      citations: [{ kind: 'record', label: 'My leave', detail: `${year}`, href: '/leave' }],
      suggestions: [],
      actions: [{ label: 'Request leave', href: '/leave/new', requiresConfirmation: true }],
    }
  }

  // --- how do I request X → matching request type + supporting policy
  const howTo = /how (do|can|to) i (request|ask|get|apply|replace|change|update)|request (a|an|new)|replacement/.test(q)
  const chunks = policyChunks(visible.policies)
  const hits = searchPolicies(chunks, question)
  if (howTo) {
    const qt = tokenize(question)
    const type = db.requestTypes
      .filter((t) => t.active && t.selfService)
      .map((t) => ({ t, s: tokenize(`${t.name} ${t.description} ${t.category}`).filter((x) => qt.includes(x)).length }))
      .sort((a, b) => b.s - a.s)[0]
    const isLeave = /leave|holiday|vacation|time off/.test(q)
    const top = hits[0]
    if (isLeave || (type && type.s > 0)) {
      const where = isLeave ? 'Leave and Attendance → Request leave' : `Employee Requests → New request → “${type?.t.name}”`
      return {
        text: `Use ${where}.${isLeave ? ' Your manager approves it; your balance updates once it is approved.' : ` ${type?.t.description} ${type?.t.approvalChain.length ? `It needs ${type.t.approvalChain.map((s) => s.name.toLowerCase()).join(', then ')}.` : 'HR handles it directly.'} Target response: ${type?.t.slaHours} business hours.`}${top && top.score > 2 && top.coverage >= 0.3 ? `\n\nFrom ${top.chunk.policy.title} (${top.chunk.heading}):\n${top.chunk.text}` : ''}`,
        citations: top && top.score > 2 && top.coverage >= 0.3 ? [policyCitation(top.chunk)] : [],
        suggestions: [],
        actions: [
          {
            label: isLeave ? 'Start a leave request' : `Start “${type?.t.name}” request`,
            href: isLeave ? '/leave/new' : `/requests/new?type=${type?.t.id}`,
            requiresConfirmation: true,
          },
        ],
      }
    }
  }

  // --- policy question
  const best = hits[0]
  if (best && best.score > 2.5 && best.coverage >= 0.4) {
    const related = hits.filter((h) => h.chunk.policy.id === best.chunk.policy.id && h.chunk !== best.chunk && h.score > best.score * 0.6).slice(0, 1)
    return {
      text: `According to the ${best.chunk.policy.title} (version ${best.chunk.version}, effective ${best.chunk.effectiveDate}) — ${best.chunk.heading}:\n${best.chunk.text}${related.map((r) => `\n\n${r.chunk.heading}:\n${r.chunk.text}`).join('')}`,
      citations: [best, ...related].map((h) => policyCitation(h.chunk)),
      suggestions: ['If your situation is not covered, ask HR with a “Policy question” request.'],
      actions: [{ label: 'Ask HR a policy question', href: '/requests/new?type=rt_policy', requiresConfirmation: true }],
    }
  }

  return {
    text: "I couldn't find a published policy or a record you have access to that answers this. I won't guess — please ask HR directly, or rephrase with the topic (for example “sick leave certificate” or “remote work eligibility”).",
    citations: [],
    suggestions: [],
    actions: [{ label: 'Ask HR', href: '/requests/new?type=rt_general', requiresConfirmation: true }],
  }
}
