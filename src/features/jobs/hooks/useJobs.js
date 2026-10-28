import { useMemo } from 'react'
import { useCollection, useLookups } from '@/hooks/useStore'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { useSession } from '@/app/providers/SessionContext'
import { jobService } from '@/features/jobs/jobService'
import { matchesJob } from '@/utils/search'

export const JOB_FILTER_DEFAULTS = { q: '', status: 'all', department: 'all', recruiter: 'all' }

/** Vacancies with applicant counts and per-stage distribution. */
export function useJobRows() {
  const jobs = useCollection('jobs')
  const applications = useCollection('applications')
  const { departmentsById, usersById } = useLookups()

  return useMemo(
    () =>
      jobs.map((job) => {
        const apps = applications.filter((a) => a.jobId === job.id)
        const active = apps.filter((a) => a.status === 'active')
        const hired = apps.filter((a) => a.status === 'hired').length
        const byStage = job.stages.map((s) => ({ ...s, count: active.filter((a) => a.stageId === s.id).length }))
        return {
          id: job.id,
          job,
          title: job.title,
          department: departmentsById.get(job.departmentId),
          recruiter: usersById.get(job.recruiterId),
          hiringManager: usersById.get(job.hiringManagerId),
          applicants: apps.length,
          active: active.length,
          hired,
          byStage,
          newThisWeek: apps.filter((a) => Date.now() - new Date(a.appliedAt).getTime() < 7 * 86_400_000).length,
          createdAt: job.createdAt,
        }
      }),
    [jobs, applications, departmentsById, usersById],
  )
}

export function useJobs(filters) {
  const rows = useJobRows()
  const filtered = useMemo(
    () =>
      rows.filter(({ job }) => {
        if (!matchesJob(job, filters.q)) return false
        if (filters.status !== 'all' && job.status !== filters.status) return false
        if (filters.department !== 'all' && job.departmentId !== filters.department) return false
        if (filters.recruiter !== 'all' && job.recruiterId !== filters.recruiter) return false
        return true
      }),
    [rows, filters],
  )
  const statusCounts = useMemo(() => {
    const counts = { all: rows.length }
    rows.forEach(({ job }) => {
      counts[job.status] = (counts[job.status] ?? 0) + 1
    })
    return counts
  }, [rows])
  return { rows: filtered, statusCounts }
}

export function useJobActions() {
  const { actorId } = useSession()
  const ctx = { actorId }
  return {
    create: useAsyncAction((values) => jobService.create(values, ctx), { success: (j) => `Vacancy “${j.title}” created` }),
    update: useAsyncAction((id, values) => jobService.update(id, values, ctx), { success: 'Vacancy saved' }),
    setStatus: useAsyncAction((id, status) => jobService.setStatus(id, status, ctx), { success: 'Vacancy status updated' }),
  }
}

/** Select options used by several forms. */
export function useOrgOptions() {
  const departments = useCollection('departments')
  const users = useCollection('users')
  const jobs = useCollection('jobs')
  const workflowTemplates = useCollection('workflowTemplates')
  return useMemo(
    () => ({
      departments: departments.map((d) => ({ value: d.id, label: d.name })),
      recruiters: users
        .filter((u) => (u.role === 'Recruiter' || u.role === 'Admin') && u.status !== 'deactivated')
        .map((u) => ({ value: u.id, label: u.name })),
      hiringManagers: users.filter((u) => u.role === 'Hiring Manager' || u.role === 'Admin').map((u) => ({ value: u.id, label: u.name })),
      interviewers: users.filter((u) => u.status === 'active').map((u) => ({ value: u.id, label: u.name, description: u.title })),
      jobs: jobs.map((j) => ({ value: j.id, label: j.title, status: j.status })),
      openJobs: jobs.filter((j) => j.status === 'open').map((j) => ({ value: j.id, label: j.title })),
      workflowTemplates: workflowTemplates.map((t) => ({ value: t.id, label: t.name })),
    }),
    [departments, users, jobs, workflowTemplates],
  )
}
