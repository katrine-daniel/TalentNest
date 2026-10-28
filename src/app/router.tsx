import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import LoadingState from '@/components/ui/LoadingState'
import { GuestOnly, RequireAuth, RequirePermission } from './guards'
import { ROUTES } from '@/config/routes'

// Route-level code splitting keeps the initial bundle small (charts load on demand).
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))
const CandidatesPage = lazy(() => import('@/features/candidates/CandidatesPage'))
const CandidateDetailsPage = lazy(() => import('@/features/candidates/CandidateDetailsPage'))
const JobsPage = lazy(() => import('@/features/jobs/JobsPage'))
const JobDetailsPage = lazy(() => import('@/features/jobs/JobDetailsPage'))
const PipelinePage = lazy(() => import('@/features/pipeline/PipelinePage'))
const AssessmentsPage = lazy(() => import('@/features/assessments/AssessmentsPage'))
const CalendarPage = lazy(() => import('@/features/interviews/CalendarPage'))
const OffersPage = lazy(() => import('@/features/offers/OffersPage'))
const AnalyticsPage = lazy(() => import('@/features/analytics/AnalyticsPage'))
const AIAssistantPage = lazy(() => import('@/features/ai/AIAssistantPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))
const RequisitionsPage = lazy(() => import('@/features/requisitions/RequisitionsPage'))
const TalentPage = lazy(() => import('@/features/talent/TalentPage'))
const ComparePage = lazy(() => import('@/features/compare/ComparePage'))
const OnboardingPage = lazy(() => import('@/features/onboarding/OnboardingPage'))
const TasksPage = lazy(() => import('@/features/tasks/TasksPage'))
const AutomationPage = lazy(() => import('@/features/automation/AutomationPage'))
const NotFoundPage = lazy(() => import('./NotFoundPage'))

const LoginPage = lazy(() => import('@/features/auth/LoginPage'))
const SignUpPage = lazy(() => import('@/features/auth/SignUpPage'))
const ForgotPasswordPage = lazy(() => import('@/features/auth/PasswordPages').then((m) => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('@/features/auth/PasswordPages').then((m) => ({ default: m.ResetPasswordPage })))
const CreateOrganizationPage = lazy(() => import('@/features/auth/CreateOrganizationPage'))

export default function AppRoutes() {
  return (
    <Suspense fallback={<LoadingState variant="inline" />}>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path={ROUTES.login} element={<LoginPage />} />
          <Route path={ROUTES.signup} element={<SignUpPage />} />
          <Route path={ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
        </Route>
        {/* Reachable with a recovery session from the email link. */}
        <Route path={ROUTES.resetPassword} element={<ResetPasswordPage />} />
        <Route path={ROUTES.setupOrganization} element={<CreateOrganizationPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="candidates" element={<CandidatesPage />} />
            <Route path="candidates/:candidateId" element={<CandidateDetailsPage />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="jobs/:jobId" element={<JobDetailsPage />} />
            <Route path="pipeline" element={<PipelinePage />} />
            <Route path="assessments" element={<AssessmentsPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="interviews" element={<Navigate to="/calendar" replace />} />
            <Route path="offers" element={<OffersPage />} />
            <Route path="requisitions" element={<RequisitionsPage />} />
            <Route path="talent" element={<TalentPage />} />
            <Route path="compare" element={<ComparePage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route
              path="automation"
              element={
                <RequirePermission permission="automation.manage">
                  <AutomationPage />
                </RequirePermission>
              }
            />
            <Route
              path="analytics"
              element={
                <RequirePermission permission="analytics.view">
                  <AnalyticsPage />
                </RequirePermission>
              }
            />
            <Route
              path="ai-assistant"
              element={
                <RequirePermission permission="ai.use">
                  <AIAssistantPage />
                </RequirePermission>
              }
            />
            <Route path="settings" element={<Navigate to="/settings/users" replace />} />
            <Route path="settings/:section" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
