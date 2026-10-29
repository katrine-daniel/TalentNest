// PeopleOS assistant — policy questions answered by Claude, grounded in published policies.
//
// NOT TESTED AGAINST A LIVE DEPLOYMENT (no credentials were available during development).
//
// - Requires a signed-in user. Policies are read with the user's JWT, so row-level security limits
//   them to published policies in the user's audience — the model never sees anything else.
// - The provider key (ANTHROPIC_API_KEY) is a function secret; it never reaches the browser.
// - Questions about the user's own records (approvals, balances, overdue tasks) are answered in the
//   browser from records the user can already see; they are not sent here.
// - The model must answer only from the supplied policy text, cite policy ids that exist in the
//   context, and say when the policies do not cover the question. Citations are validated server-side.
import Anthropic from 'npm:@anthropic-ai/sdk'
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk/helpers/zod'
import { z } from 'npm:zod@3'
import { cors, json, rateLimited, userClient } from '../_shared/auth.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })
const MODEL = Deno.env.get('AI_MODEL') ?? 'claude-opus-5-5'
const MAX_CONTEXT_CHARS = 40_000

const Output = z.object({
  found: z.boolean(),
  answer: z.string(),
  citations: z.array(z.object({ policyId: z.string(), section: z.string() })),
  suggestions: z.array(z.string()),
})

const SYSTEM = `You answer employees' questions about their company's HR policies.
Rules:
- Use only the policy text provided in <policies>. Do not use outside knowledge about employment law or other companies.
- If the policies do not answer the question, set "found" to false and say plainly that the published policies do not cover it.
- Cite every policy you rely on by its id and the section heading.
- Put advice or next steps that are not stated in a policy in "suggestions", never in "answer".
- Never make or imply decisions about hiring, discipline, pay, approval or termination of any person.
- Be concise and quote numbers exactly as written in the policy.`

interface PolicyRow {
  id: string
  data: { title: string; publishedVersion: number | null; versions: Array<{ version: number; body: string; effectiveDate: string }> }
}

const tokens = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  )

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = await userClient(req)
  if (!auth) return json({ error: 'Sign in required' }, 401)
  if (rateLimited(auth.userId, 12)) return json({ error: 'Too many requests' }, 429)

  const body = await req.json().catch(() => null)
  const question = typeof body?.question === 'string' ? body.question.trim().slice(0, 1000) : ''
  if (!question) return json({ error: 'Question required' }, 400)

  const { data: membership } = await auth.client.from('memberships').select('org_id').eq('user_id', auth.userId).eq('status', 'active').limit(1).maybeSingle()
  if (!membership) return json({ error: 'No active organization membership' }, 403)
  const { data: rows, error } = await auth.client.from('policies').select('id, data').eq('org_id', membership.org_id).eq('status', 'published')
  if (error) return json({ error: 'Could not load policies' }, 502)

  // Rank published versions by word overlap with the question and keep the best within the context budget.
  const q = tokens(question)
  const policies = ((rows ?? []) as PolicyRow[])
    .map((p) => ({ id: p.id, title: p.data.title, v: p.data.versions.find((x) => x.version === p.data.publishedVersion) }))
    .filter((p): p is { id: string; title: string; v: NonNullable<typeof p.v> } => Boolean(p.v))
    .map((p) => ({ ...p, score: [...tokens(`${p.title} ${p.v.body}`)].filter((t) => q.has(t)).length }))
    .sort((a, b) => b.score - a.score)
  const context: typeof policies = []
  let size = 0
  for (const p of policies) {
    if (size + p.v.body.length > MAX_CONTEXT_CHARS) break
    context.push(p)
    size += p.v.body.length
  }
  if (!context.length) {
    return json({
      text: 'There are no published policies available to you, so I can’t answer from company policy. Please ask HR.',
      citations: [],
      suggestions: [],
      actions: [{ label: 'Ask HR', href: '/requests/new', requiresConfirmation: true }],
    })
  }

  const history = Array.isArray(body?.history)
    ? body.history.slice(-6).filter((m: { role?: string; text?: string }) => (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
    : []
  const policiesXml = context
    .map((p) => `<policy id="${p.id}" title="${p.title.replace(/"/g, "'")}" version="${p.v.version}" effective="${p.v.effectiveDate}">\n${p.v.body}\n</policy>`)
    .join('\n')

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: zodOutputFormat(Output) },
      system: SYSTEM,
      messages: [
        ...history.map((m: { role: 'user' | 'assistant'; text: string }) => ({ role: m.role, content: m.text.slice(0, 2000) })),
        { role: 'user', content: `<policies>\n${policiesXml}\n</policies>\n\nQuestion: ${question}` },
      ],
    })
    if (response.stop_reason === 'refusal') return json({ error: 'The AI service declined this question' }, 422)
    const block = response.content.find((b) => b.type === 'text')
    const parsed = block?.type === 'text' ? Output.safeParse(JSON.parse(block.text)) : null
    if (!parsed?.success) return json({ error: 'Unexpected AI response' }, 502)

    const byId = new Map(context.map((p) => [p.id, p]))
    const citations = parsed.data.citations
      .filter((c) => byId.has(c.policyId))
      .map((c) => {
        const p = byId.get(c.policyId)!
        return {
          kind: 'policy',
          label: `${p.title} — ${c.section}`.slice(0, 160),
          detail: `v${p.v.version} · effective ${p.v.effectiveDate}`,
          href: `/policies/${p.id}`,
        }
      })
    return json({
      text: parsed.data.answer,
      citations,
      suggestions: parsed.data.suggestions.slice(0, 5),
      actions: parsed.data.found ? [] : [{ label: 'Ask HR a policy question', href: '/requests/new', requiresConfirmation: true }],
    })
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Rate limited' }, 429)
    if (e instanceof Anthropic.APIError) return json({ error: `AI provider error (${e.status})` }, 502)
    return json({ error: 'Assistant request failed' }, 500)
  }
})
