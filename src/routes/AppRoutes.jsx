import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'

// Route-level code splitting keeps the initial bundle small (charts load on demand).
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const CandidatesPage = lazy(() => import('@/pages/CandidatesPage'))
const CandidateDetailsPage = lazy(() => import('@/pages/CandidateDetailsPage'))
const JobsPage = lazy(() => import('@/pages/JobsPage'))
const JobDetailsPage = lazy(() => import('@/pages/JobDetailsPage'))
const PipelinePage = lazy(() => import('@/pages/PipelinePage'))
const AssessmentsPage = lazy(() => import('@/pages/AssessmentsPage'))
const CalendarPage = lazy(() => import('@/pages/CalendarPage'))
const OffersPage = lazy(() => import('@/pages/OffersPage'))
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'))
const AIAssistantPage = lazy(() => import('@/pages/AIAssistantPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'))

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
