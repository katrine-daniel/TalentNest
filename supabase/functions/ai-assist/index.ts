// AI proxy for TalentNest (Supabase Edge Function, Deno).
//
// UNTESTED against a live deployment — review before production use.
//
// - Requires a signed-in user with the `ai.use` permission in an organization.
// - Holds the Anthropic API key as a function secret (ANTHROPIC_API_KEY); the browser never sees it.
// - Receives the minimized payload built by src/features/ai/aiProvider.ts (candidate reference ID,
//   skills and work history only — no contact details) and returns the AIResponse shape the UI renders.
// - Output is constrained with structured outputs, so the response is always valid JSON for its kind.
import Anthropic from 'npm:@anthropic-ai/sdk'
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk/helpers/zod'
import { z } from 'npm:zod@3'
import { cors, json, userClient } from '../_shared/auth.ts'

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })
const MODEL = Deno.env.get('AI_MODEL') ?? 'claude-opus-5-5'

const SYSTEM = `You assist recruiters at a hiring company. Rules you must follow:
- Use only the job-related information provided. Never infer or mention age, gender, ethnicity, religion, disability, marital or family status, nationality, or other protected characteristics.
- Never recommend rejecting or hiring anyone; you support human reviewers, you do not decide.
- Separate what the record states ("verified") from what you infer ("inferred"), and say when the data is insufficient.
- Be concise and specific to the role.`

const KINDS = {
  summary: z.object({ verified: z.array(z.string()), inferred: z.array(z.string()) }),
  suggestions: z.object({ items: z.array(z.object({ title: z.string(), detail: z.string(), basis: z.string() })) }),
  questions: z.object({ items: z.array(z.object({ question: z.string(), focus: z.string(), lookFor: z.string() })) }),
  email: z.object({ subject: z.string(), body: z.string() }),
  text: z.object({ text: z.string() }),
}
type Kind = keyof typeof KINDS

const TASKS: Record<string, { kind: Kind; title: string; instruction: string }> = {
  summary: { kind: 'summary', title: 'Candidate summary', instruction: 'Summarise the candidate for this role in 3–6 verified points and up to 3 clearly inferred points.' },
  resume: { kind: 'summary', title: 'Resume extraction', instruction: 'List the key facts from the candidate record as verified points; add inferred points only where clearly supported.' },
  match: { kind: 'summary', title: 'Skill match', instruction: 'Compare the candidate with the job requirements. Verified: requirements the record evidences. Inferred: likely but unproven matches and gaps.' },
  'resume-tips': { kind: 'suggestions', title: 'Resume improvement tips', instruction: 'Suggest up to 5 concrete improvements to how the candidate presents relevant experience for this job; in "basis" name the record detail each relies on.' },
  'jd-review': { kind: 'suggestions', title: 'Job description review', instruction: 'Suggest up to 6 improvements to the job description for clarity, inclusive wording and accurate requirements; in "basis" quote the passage concerned.' },
  'interview-q': { kind: 'questions', title: 'Interview questions', instruction: 'Write 6 structured, job-related interview questions; for each give the competency it assesses as "focus" and what a strong answer shows as "lookFor".' },
  'assessment-q': { kind: 'questions', title: 'Assessment questions', instruction: 'Write 8 assessment questions testing the job’s required skills; give the skill tested as "focus" and the expected answer as "lookFor".' },
  email: { kind: 'email', title: 'Email draft', instruction: 'Draft a short, professional email to the candidate about the stated purpose. Do not promise outcomes.' },
  feedback: { kind: 'text', title: 'Feedback summary', instruction: 'Summarise what interview feedback would need to cover for this candidate and role. Do not invent feedback.' },
  funnel: { kind: 'text', title: 'Funnel insights', instruction: 'Explain which recruiting-funnel metrics to review for this role and why. Do not invent numbers.' },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const auth = await userClient(req)
  if (!auth) return json({ error: 'Sign in required' }, 401)

  // Permission check through RLS-protected data: the user's active membership.
  const { data: memberships } = await auth.client.from('memberships').select('org_id').eq('user_id', auth.userId).eq('status', 'active')
  const orgId = memberships?.[0]?.org_id
  const { data: allowed } = orgId ? await auth.client.rpc('has_org_permission', { p_org: orgId, p_permission: 'ai.use' }) : { data: false }
  if (!allowed) return json({ error: 'AI tools are not enabled for your role' }, 403)

  const body = await req.json().catch(() => null)
  const task = body && TASKS[body.task as string]
  if (!task) return json({ error: 'Unknown task' }, 400)
  const schema = KINDS[task.kind]

  // Only the documented, minimized fields are forwarded.
  const context = { stage: body.stageName ?? null, purpose: body.purpose ?? null, candidate: body.candidate ?? null, job: body.job ?? null }

  try {
    const response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      // On a safety-classifier decline, the API re-runs the request on Anthropic's recommended fallback model.
      fallbacks: 'default',
      output_config: { effort: 'medium', format: zodOutputFormat(schema) },
      system: SYSTEM,
      messages: [{ role: 'user', content: `${task.instruction}\n\nContext (JSON):\n${JSON.stringify(context)}` }],
    })

    if (response.stop_reason === 'refusal') return json({ error: 'The AI service declined this request.' }, 422)
    if (response.stop_reason === 'max_tokens') return json({ error: 'The AI response was too long. Try a narrower request.' }, 502)

    const text = response.content.find((b) => b.type === 'text')
    const parsed = text?.type === 'text' ? schema.safeParse(JSON.parse(text.text)) : null
    if (!parsed?.success) return json({ error: 'The AI service returned an unexpected response.' }, 502)

    return json({
      kind: task.kind,
      title: task.title,
      // The editor in the app keys questions by id.
      data: 'items' in parsed.data && task.kind === 'questions' ? { items: parsed.data.items.map((q, i) => ({ ...q, id: `q-${i + 1}` })) } : parsed.data,
      sources: [{ label: 'Generated by AI', detail: `Model ${response.model}; based on the candidate reference and job details sent from TalentNest.` }],
      caveat: 'AI-generated. Review before acting; this is not a hiring decision.',
      editable: task.kind === 'email' || task.kind === 'questions',
    })
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json({ error: 'Rate limited' }, 429)
    if (error instanceof Anthropic.APIError) return json({ error: `AI provider error (${error.status})` }, 502)
    return json({ error: 'AI request failed' }, 500)
  }
})
