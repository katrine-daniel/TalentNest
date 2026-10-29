import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { AppShell } from '@/components/shell/AppShell'
import { ToastProvider } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/Layout'
import type { Permission } from '@/domain/permissions'
import { SignInPage } from '@/features/auth/SignInPage'
import { ErrorBoundary } from './ErrorBoundary'
import { useStoreStatus } from './hooks'
import { AuthProvider, useAuth, useSession } from './session'

const WorkspacePage = lazy(() => import('@/features/workspace/WorkspacePage'))
const AssistantPage = lazy(() => import('@/features/assistant/AssistantPage'))
const InboxPage = lazy(() => import('@/features/inbox/InboxPage'))
const PeoplePage = lazy(() => import('@/features/people/PeoplePage'))
const EmployeePage = lazy(() => import('@/features/people/EmployeePage'))
const RequestsPage = lazy(() => import('@/features/requests/RequestsPage'))
const RequestPage = lazy(() => import('@/features/requests/RequestPage'))
const NewRequestPage = lazy(() => import('@/features/requests/NewRequestPage'))
const LeavePage = lazy(() => import('@/features/leave/LeavePage'))
const LeaveDetailPage = lazy(() => import('@/features/leave/LeaveDetailPage'))
const NewLeavePage = lazy(() => import('@/features/leave/NewLeavePage'))
const LifecyclePage = lazy(() => import('@/features/lifecycle/LifecyclePage'))
const CasePage = lazy(() => import('@/features/lifecycle/CasePage'))
const PoliciesPage = lazy(() => import('@/features/policies/PoliciesPage'))
const PolicyPage = lazy(() => import('@/features/policies/PolicyPage'))
const PolicyEditorPage = lazy(() => import('@/features/policies/PolicyEditorPage'))
const AnalyticsPage = lazy(() => import('@/features/analytics/AnalyticsPage'))
const AutomationPage = lazy(() => import('@/features/automation/AutomationPage'))
const OrganizationPage = lazy(() => import('@/features/organization/OrganizationPage'))
const IntegrationsPage = lazy(() => import('@/features/integrations/IntegrationsPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))

function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="text-muted grid min-h-dvh place-items-center text-sm" role="status">
      <span className="flex items-center gap-2">
        <Loader2 size={16} className="animate-spin" aria-hidden /> {label}
      </span>
    </div>
  )
}

function RequireAuth() {
  const auth = useAuth()
  const data = useStoreStatus()
  if (auth.status === 'loading' || (auth.status === 'signed-in' && data.status !== 'ready' && data.status !== 'error'))
    return <FullScreenLoader label="Loading your workspace…" />
  if (auth.status !== 'signed-in') return <SignInPage />
  if (data.status === 'error')
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <p role="alert" className="bg-danger-soft text-danger max-w-md rounded-md p-4 text-sm">
          {data.error}
        </p>
      </div>
    )
  return <AppShell />
}

function Guard({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { can } = useSession()
  if (!can(permission)) return <EmptyState title="You don’t have access to this page" description="Ask an administrator if you need it for your work." />
  return <>{children}</>
}

function Pages() {
  const location = useLocation()
  return (
    <ErrorBoundary resetKey={location.pathname}>
      <Suspense
        fallback={
          <div className="text-muted p-8 text-sm" role="status">
            Loading…
          </div>
        }
      >
        <Routes>
          <Route element={<RequireAuth />}>
            <Route index element={<WorkspacePage />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="people" element={<PeoplePage />} />
            <Route path="people/:employeeId" element={<EmployeePage />} />
            <Route path="requests" element={<RequestsPage />} />
            <Route path="requests/new" element={<NewRequestPage />} />
            <Route path="requests/:requestId" element={<RequestPage />} />
            <Route path="leave" element={<LeavePage />} />
            <Route path="leave/new" element={<NewLeavePage />} />
            <Route path="leave/:leaveId" element={<LeaveDetailPage />} />
            <Route path="lifecycle" element={<LifecyclePage />} />
            <Route path="lifecycle/:caseId" element={<CasePage />} />
            <Route path="policies" element={<PoliciesPage />} />
            <Route
              path="policies/new"
              element={
                <Guard permission="policies.manage">
                  <PolicyEditorPage />
                </Guard>
              }
            />
            <Route path="policies/:policyId" element={<PolicyPage />} />
            <Route
              path="policies/:policyId/edit"
              element={
                <Guard permission="policies.manage">
                  <PolicyEditorPage />
                </Guard>
              }
            />
            <Route
              path="analytics"
              element={
                <Guard permission="analytics.view">
                  <AnalyticsPage />
                </Guard>
              }
            />
            <Route
              path="automation"
              element={
                <Guard permission="automation.manage">
                  <AutomationPage />
                </Guard>
              }
            />
            <Route
              path="organization"
              element={
                <Guard permission="org.manage">
                  <OrganizationPage />
                </Guard>
              }
            />
            <Route
              path="integrations"
              element={
                <Guard permission="org.manage">
                  <IntegrationsPage />
                </Guard>
              }
            />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="reset-password" element={<SettingsPage />} />
            <Route
              path="*"
              element={
                <EmptyState
                  title="Page not found"
                  description="The link may be out of date."
                  action={
                    <a className="text-brand-700 text-sm font-medium hover:underline" href={import.meta.env.BASE_URL}>
                      Go to your workspace
                    </a>
                  }
                />
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <ToastProvider>
        <AuthProvider>
          <Pages />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
