import { useEffect } from 'react'
import { MotionConfig } from 'framer-motion'
import AppRoutes from './router'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import { ToastProvider, useToast } from '@/components/ui/Toast'
import { AuthProvider } from '@/app/providers/AuthProvider'
import { SessionProvider } from '@/app/providers/SessionContext'
import { ThemeProvider } from '@/app/providers/ThemeProvider'
import { dataStore } from '@/services/storage/dataStore'

/** Surfaces background save failures (e.g. lost connection to Supabase). */
function PersistErrorReporter() {
  const toast = useToast()
  useEffect(
    () =>
      dataStore.onPersistError((error) => {
        toast.error(error.message, 'Changes were not saved')
      }),
    [toast],
  )
  return null
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}>
      <ErrorBoundary>
        <ThemeProvider>
          <ToastProvider>
            <PersistErrorReporter />
            <AuthProvider>
              <SessionProvider>
                <AppRoutes />
              </SessionProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </MotionConfig>
  )
}
