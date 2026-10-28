import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/utils/cn'

const ToastContext = createContext(null)

const ICONS = {
  success: { Icon: CheckCircle2, className: 'text-emerald-600' },
  error: { Icon: AlertCircle, className: 'text-red-600' },
  info: { Icon: Info, className: 'text-brand-600' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const counter = useRef(0)

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (type, message, title, action) => {
      counter.current += 1
      const id = counter.current
      setToasts((list) => [...list.slice(-3), { id, type, message, title, action }])
      setTimeout(() => dismiss(id), type === 'error' ? 6000 : 4000)
      return id
    },
    [dismiss],
  )

  const api = useMemo(
    () => ({
      success: (message, title, action) => push('success', message, title, action),
      error: (message, title, action) => push('error', message, title, action),
      info: (message, title, action) => push('info', message, title, action),
      dismiss,
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
          aria-live="polite"
          aria-atomic="false"
        >
          <AnimatePresence initial={false}>
            {toasts.map((t) => {
              const { Icon, className } = ICONS[t.type]
              return (
                <motion.div
                  key={t.id}
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
                  role={t.type === 'error' ? 'alert' : 'status'}
                  className="border-line bg-surface shadow-pop pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3"
                >
                  <Icon size={18} className={cn('mt-px shrink-0', className)} aria-hidden />
                  <div className="min-w-0 flex-1 text-sm">
                    {t.title && <p className="text-ink font-medium">{t.title}</p>}
                    <p className={cn(t.title ? 'text-muted text-xs' : 'text-ink')}>{t.message}</p>
                    {t.action && (
                      <button
                        type="button"
                        className="text-brand-600 mt-1 text-xs font-medium hover:underline"
                        onClick={() => {
                          t.action.onClick()
                          dismiss(t.id)
                        }}
                      >
                        {t.action.label}
                      </button>
                    )}
                  </div>
                  <button type="button" onClick={() => dismiss(t.id)} className="text-faint hover:text-ink rounded p-0.5" aria-label="Dismiss notification">
                    <X size={14} />
                  </button>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
