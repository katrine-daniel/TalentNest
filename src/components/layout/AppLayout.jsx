import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileNavigation from './MobileNavigation'
import ErrorBoundary from '@/components/ui/ErrorBoundary'
import ErrorState from '@/components/ui/ErrorState'
import LoadingState from '@/components/ui/LoadingState'
import { GlobalActionsProvider } from '@/app/providers/GlobalActionsContext'
import { useDbStatus } from '@/hooks/useStore'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { mockDb } from '@/services/storage/mockDb'
import { UI_PREFS_KEY } from '@/config/env'
import { cn } from '@/utils/cn'

function readCollapsed() {
  try {
    return JSON.parse(localStorage.getItem(UI_PREFS_KEY) ?? '{}').sidebarCollapsed ?? false
  } catch {
    return false
  }
}

export default function AppLayout() {
  const location = useLocation()
  const { ready, status, error } = useDbStatus()
  const isDesktop = useIsDesktop()
  const [collapsedPref, setCollapsedPref] = useState(readCollapsed)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const collapsed = !isDesktop || collapsedPref

  useEffect(() => {
    try {
      localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ sidebarCollapsed: collapsedPref }))
    } catch {
      /* preference is optional */
    }
  }, [collapsedPref])

  useEffect(() => {
    setMobileNavOpen(false)
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  let content
  if (status === 'error') {
    content = (
      <ErrorState
        title="Demo data could not be loaded"
        description={error?.message}
        retryLabel="Restore sample data"
        onRetry={() => mockDb.reset()}
      />
    )
  } else if (!ready) {
    content = <LoadingState />
  } else {
    content = (
      <ErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<LoadingState />}>
          <motion.div key={location.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}>
            <Outlet />
          </motion.div>
        </Suspense>
      </ErrorBoundary>
    )
  }

  return (
    <GlobalActionsProvider>
      <a href="#main" className="sr-only z-50 rounded-md bg-brand-600 px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <Sidebar collapsed={collapsed} canToggle={isDesktop} onToggle={() => setCollapsedPref((c) => !c)} />
      <MobileNavigation open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      <div className={cn('min-h-dvh transition-[padding] duration-200 ease-out md:pl-16', !collapsed && 'lg:pl-64')}>
        <Topbar onOpenNav={() => setMobileNavOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-[1480px] px-4 pt-5 pb-16 sm:px-6 lg:px-8 lg:pt-6">
          {content}
        </main>
      </div>
    </GlobalActionsProvider>
  )
}
