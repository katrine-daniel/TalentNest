import { useEffect } from 'react'
import { MotionConfig } from 'framer-motion'
import AppRoutes from './router'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { ToastProvider } from '@/components/ui/Toast'
import { SessionProvider } from '@/app/providers/SessionContext'
import { mockDb } from '@/services/storage/mockDb'

export default function App() {
  useEffect(() => {
    mockDb.load()
  }, [])

  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}>
      <ErrorBoundary>
        <ToastProvider>
          <SessionProvider>
            <AppRoutes />
          </SessionProvider>
        </ToastProvider>
      </ErrorBoundary>
    </MotionConfig>
  )
}
