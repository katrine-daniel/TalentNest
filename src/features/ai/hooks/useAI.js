import { useCallback, useRef, useState } from 'react'
import { AI_TOOLS, ask } from '@/features/ai/aiService'

let seq = 0
const nextId = () => `msg-${Date.now()}-${(seq += 1)}`

/**
 * Conversation state for the AI assistant. Each request is an async call to
 * aiService (simulated today); errors are kept on the message so they can be retried.
 */
export function useAI() {
  const [messages, setMessages] = useState([])
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const execute = useCallback(async (userText, runner) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    const assistantId = nextId()
    setMessages((m) => [...m, { id: nextId(), role: 'user', text: userText }, { id: assistantId, role: 'assistant', status: 'loading', runner, prompt: userText }])
    try {
      const response = await runner()
      setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, status: 'done', response } : x)))
    } catch (error) {
      setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, status: 'error', error: error?.message ?? 'The assistant could not complete this request.' } : x)))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [])

  const runTool = useCallback(
    (toolId, context, label) => {
      const tool = AI_TOOLS.find((t) => t.id === toolId)
      return execute(label ?? tool.label, () => tool.run(context))
    },
    [execute],
  )

  const sendMessage = useCallback((text, context) => execute(text, () => ask(text, context)), [execute])

  const retry = useCallback(async (messageId) => {
    const msg = messages.find((m) => m.id === messageId)
    if (!msg?.runner || busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setMessages((m) => m.map((x) => (x.id === messageId ? { ...x, status: 'loading', error: null } : x)))
    try {
      const response = await msg.runner()
      setMessages((m) => m.map((x) => (x.id === messageId ? { ...x, status: 'done', response } : x)))
    } catch (error) {
      setMessages((m) => m.map((x) => (x.id === messageId ? { ...x, status: 'error', error: error?.message } : x)))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [messages])

  const updateResponse = useCallback((messageId, data) => {
    setMessages((m) => m.map((x) => (x.id === messageId ? { ...x, response: { ...x.response, data: { ...x.response.data, ...data }, edited: true } } : x)))
  }, [])

  const clear = useCallback(() => setMessages([]), [])

  return { messages, busy, runTool, sendMessage, retry, updateResponse, clear }
}
