import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'

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
const NotFoundPage = lazy(() => import('./NotFoundPage'))

export default function AppRoutes() {
  return (
    <Routes>
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
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="ai-assistant" element={<AIAssistantPage />} />
        <Route path="settings" element={<Navigate to="/settings/users" replace />} />
        <Route path="settings/:section" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
