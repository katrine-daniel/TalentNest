/**
 * AI provider boundary.
 *
 * - `demo`: tools run locally with deterministic rules (see aiService) and every
 *   response is labelled "Simulated".
 * - `proxy`: tools are sent to VITE_AI_PROXY_URL — a server you control (e.g. the
 *   Supabase Edge Function in supabase/functions/ai-assist) that holds the AI
 *   provider key. The browser never sees that key.
 *
 * Payloads are minimized: candidates are identified by reference ID only, and
 * contact details or protected characteristics are never sent.
 */
import { env } from '@/config/env'
import { getSupabase } from '@/lib/supabase'
import { dataStore } from '@/services/storage/dataStore'
import { ServiceError } from '@/services/api/apiClient'

export interface AIContext {
  candidateId?: string
  jobId?: string
  stageName?: string
  purpose?: string
}

export interface AIResponse {
  kind: string
  title: string
  data: unknown
  sources?: Array<{ label: string; detail?: string }>
  caveat?: string | null
  editable?: boolean
}

/** Only job-related fields leave the browser. */
export function buildPayload(task: string, ctx: AIContext) {
  const candidate = ctx.candidateId ? dataStore.read('candidates').find((c) => c.id === ctx.candidateId) : undefined
  const job = ctx.jobId ? dataStore.read('jobs').find((j) => j.id === ctx.jobId) : undefined
  return {
    task,
    stageName: ctx.stageName,
    purpose: ctx.purpose,
    candidate: candidate && {
      ref: candidate.ref,
      experienceYears: candidate.experienceYears,
      currentTitle: candidate.currentTitle,
      skills: candidate.skills,
      experience: candidate.experience.map(({ title, company, start, end, summary }) => ({ title, company, start, end, summary })),
      education: candidate.education.map(({ degree, institution, year }) => ({ degree, institution, year })),
    },
    job: job && {
      title: job.title,
      skills: job.skills,
      description: job.description,
      experienceMin: job.experienceMin,
      experienceMax: job.experienceMax,
      workMode: job.workMode,
    },
  }
}

interface Provider {
  mode: 'demo' | 'proxy'
  run(task: string, payload: ReturnType<typeof buildPayload>): Promise<AIResponse>
}

function isAIResponse(value: unknown): value is AIResponse {
  return typeof value === 'object' && value !== null && typeof (value as AIResponse).kind === 'string' && typeof (value as AIResponse).title === 'string'
}

export function getAIProvider(): Provider {
  if (!env.aiProxyUrl) {
    return {
      mode: 'demo',
      run: () => Promise.reject(new ServiceError('No AI proxy is configured.', 'not-configured')),
    }
  }
  return {
    mode: 'proxy',
    async run(task, payload) {
      const session = await getSupabase()?.auth.getSession()
      const token = session?.data.session?.access_token
      const res = await fetch(env.aiProxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ ...payload, task }),
      }).catch(() => null)
      // Never fall back to simulated output silently — the user must know which they got.
      if (!res) throw new ServiceError('The AI service could not be reached. Check your connection and try again.', 'network')
      if (!res.ok)
        throw new ServiceError(
          res.status === 429 ? 'The AI service is rate-limited. Try again shortly.' : `The AI service returned an error (${res.status}).`,
          'ai-error',
        )
      const body: unknown = await res.json().catch(() => null)
      if (!isAIResponse(body)) throw new ServiceError('The AI service returned an unexpected response.', 'ai-error')
      return { ...body, caveat: body.caveat ?? 'AI-generated. Review before acting; this is not a hiring decision.' }
    },
  }
}
