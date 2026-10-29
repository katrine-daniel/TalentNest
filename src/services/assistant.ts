/**
 * Assistant provider boundary.
 *  - demo: the deterministic engine in domain/assistant.ts, labelled "Demo — not AI" in the UI.
 *  - ai: POST to VITE_ASSISTANT_URL (the `assistant` Edge Function). The function verifies the
 *    user's JWT, retrieves only records and policies RLS allows, and calls the AI provider with a
 *    server-side key. The browser never holds a provider key.
 * A failed AI call is reported as an error — it never silently falls back to demo answers.
 */
import { env } from '@/config/env'
import { createId, nowISO } from '@/lib/utils'
import { answerDemo } from '@/domain/assistant'
import type { Account, AssistantMessage, Conversation, ID } from '@/domain/types'
import { visiblePolicies } from './policies'
import { replaceById, ServiceError, store } from './store'
import { transact } from './tx'

export const assistantMode: 'demo' | 'ai' = env.assistantUrl ? 'ai' : 'demo'

type TokenGetter = () => Promise<string | null>
let getToken: TokenGetter = async () => null
export function setAssistantTokenGetter(fn: TokenGetter) {
  getToken = fn
}

function isAnswer(v: unknown): v is Pick<AssistantMessage, 'text' | 'citations' | 'suggestions' | 'actions'> {
  const o = v as Record<string, unknown>
  return Boolean(o) && typeof o.text === 'string' && Array.isArray(o.citations) && Array.isArray(o.suggestions) && Array.isArray(o.actions)
}

async function askAI(question: string, history: AssistantMessage[]) {
  const token = await getToken()
  if (!token) throw new ServiceError('Sign in again to use the assistant.', 'forbidden')
  const res = await fetch(env.assistantUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ question, history: history.slice(-6).map((m) => ({ role: m.role, text: m.text })) }),
  }).catch(() => null)
  if (!res) throw new ServiceError('The assistant service could not be reached.', 'unavailable')
  if (res.status === 429) throw new ServiceError('Too many questions in a short time. Try again in a minute.', 'unavailable')
  if (!res.ok) throw new ServiceError(`The assistant service returned an error (${res.status}).`, 'unavailable')
  const body: unknown = await res.json().catch(() => null)
  if (!isAnswer(body)) throw new ServiceError('The assistant returned an unexpected response.', 'unavailable')
  return body
}

export function myConversations(account: Account): Conversation[] {
  return store.db.conversations.filter((c) => c.accountId === account.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function ask(account: Account, conversationId: ID | null, question: string): Promise<ID> {
  const text = question.trim()
  if (!text) throw new ServiceError('Type a question.')
  if (text.length > 1000) throw new ServiceError('Keep questions under 1,000 characters.')
  const db = store.db
  let convo = conversationId ? db.conversations.find((c) => c.id === conversationId && c.accountId === account.id) : undefined
  const userMsg: AssistantMessage = { id: createId('msg'), role: 'user', text, at: nowISO(), citations: [], suggestions: [], actions: [], source: null }
  if (!convo) {
    convo = { id: createId('conv'), accountId: account.id, title: text.slice(0, 60), messages: [], updatedAt: nowISO() }
    const created = convo
    transact((d) => ({ ...d, conversations: [created, ...d.conversations] }))
  }
  const id = convo.id
  const history = convo.messages
  transact((d) => ({ ...d, conversations: replaceById(d.conversations, id, (c) => ({ ...c, messages: [...c.messages, userMsg], updatedAt: nowISO() })) }))

  const answer = assistantMode === 'ai' ? await askAI(text, history) : answerDemo(store.db, account, text, { policies: visiblePolicies(store.db, account) })
  const reply: AssistantMessage = { id: createId('msg'), role: 'assistant', at: nowISO(), source: assistantMode, ...answer }
  transact((d) => ({ ...d, conversations: replaceById(d.conversations, id, (c) => ({ ...c, messages: [...c.messages, reply], updatedAt: nowISO() })) }))
  return id
}

export function deleteConversation(account: Account, id: ID) {
  const c = store.db.conversations.find((x) => x.id === id)
  if (!c || c.accountId !== account.id) throw new ServiceError('Conversation not found.', 'not_found')
  transact((d) => ({ ...d, conversations: d.conversations.filter((x) => x.id !== id) }))
}

export function clearHistory(account: Account) {
  transact((d) => ({ ...d, conversations: d.conversations.filter((x) => x.accountId !== account.id) }))
}
