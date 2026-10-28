import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { BriefcaseBusiness, CalendarPlus, Pencil, Sparkles, UserX } from 'lucide-react'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import Tabs from '@/components/ui/Tabs'
import Panel from '@/components/ui/Panel'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'
import ApplicationCard from '@/features/candidates/components/ApplicationCard'
import AddApplicationModal from '@/features/candidates/components/AddApplicationModal'
import StageBadge from '@/features/candidates/components/StageBadge'
import { ContactDetails, EducationList, ExperienceList, NotesSection, ResumeSection, SectionTitle, SkillsList } from '@/features/candidates/components/CandidateProfile'
import StageChangeDialog from '@/features/pipeline/components/StageChangeDialog'
import RecentActivity from '@/features/dashboard/components/RecentActivity'
import FeedbackSummary from '@/features/interviews/components/FeedbackSummary'
import { useCandidateActions, useCandidateDetails } from '@/features/candidates/hooks/useCandidates'
import { useStageMove } from '@/features/pipeline/hooks/useStageMove'
import { useLookups, fullName } from '@/hooks/useStore'
import { useGlobalActions } from '@/app/providers/GlobalActionsContext'
import { useSession } from '@/app/providers/SessionContext'
import { formatDate, formatDateTime } from '@/utils/formatDate'

export default function CandidateDetailsPage() {
  const { candidateId } = useParams()
  const details = useCandidateDetails(candidateId)
  const actions = useCandidateActions()
  const global = useGlobalActions()
  const { can } = useSession()
  const { templatesById } = useLookups()
  const stageMove = useStageMove(actions.moveStage.run)
  const [tab, setTab] = useState('applications')
  const [adding, setAdding] = useState(false)

  if (!details) {
    return (
      <EmptyState
        icon={UserX}
        title="Candidate not found"
        description="This profile may have been removed or the link is incorrect."
        action={<Button to="/candidates">Back to candidates</Button>}
      />
    )
  }

  const { candidate, apps, interviews, assessments, activities } = details
  const name = fullName(candidate)
  const primary = apps.find((a) => a.app.status === 'active') ?? apps[0]
  const feedbackCount = interviews.filter((i) => i.feedback).length

  const tabs = [
    { value: 'applications', label: 'Applications', count: apps.length },
    { value: 'profile', label: 'Profile' },
    { value: 'evaluations', label: 'Interviews & assessments', count: interviews.length + assessments.length },
    { value: 'notes', label: 'Notes', count: candidate.notes.length },
    { value: 'activity', label: 'Activity' },
  ]

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar name={name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
              {primary && <StageBadge app={primary.app} stage={primary.stage} />}
            </div>
            <p className="mt-0.5 text-sm text-muted">
              {candidate.currentTitle}
              {candidate.currentCompany !== '—' && ` at ${candidate.currentCompany}`} · {candidate.experienceYears} yrs experience
            </p>
            <p className="mt-0.5 text-xs text-faint">
              {candidate.ref} · {candidate.location}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={Pencil} onClick={() => global.openCandidateForm({ candidate })} disabled={!can('candidates.manage')}>
            Edit
          </Button>
          <Button icon={BriefcaseBusiness} onClick={() => setAdding(true)} disabled={!can('candidates.manage')}>
            Add to vacancy
          </Button>
          <Button icon={Sparkles} to={`/ai-assistant?candidate=${candidate.id}${primary ? `&job=${primary.job.id}` : ''}`} disabled={!can('ai.use')}>
            Ask AI
          </Button>
          <Button variant="primary" icon={CalendarPlus} onClick={() => global.openSchedule({ applicationId: primary?.app.id })} disabled={!can('interviews.schedule') || primary?.app.status !== 'active'}>
            Schedule
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Tabs tabs={tabs} value={tab} onChange={setTab} label="Candidate sections" />
          <div className="pt-5" role="tabpanel">
            {tab === 'applications' &&
              (apps.length ? (
                <div className="space-y-4">
                  {apps.map((entry, i) => (
                    <ApplicationCard key={entry.app.id} entry={entry} candidateName={name} onRequestMove={stageMove.request} defaultExpanded={i === 0} />
                  ))}
                </div>
              ) : (
                <EmptyState icon={BriefcaseBusiness} title="Not applied to any vacancy" description="Add this candidate to an open vacancy to start their pipeline." action={<Button onClick={() => setAdding(true)}>Add to vacancy</Button>} />
              ))}

            {tab === 'profile' && (
              <div className="space-y-6">
                <Panel title="Work experience" bodyClassName="px-5 pb-5">
                  <ExperienceList experience={candidate.experience} />
                </Panel>
                <Panel title="Education & languages" bodyClassName="px-5 pb-5">
                  <EducationList education={candidate.education} languages={candidate.languages} />
                </Panel>
              </div>
            )}

            {tab === 'evaluations' && (
              <div className="space-y-6">
                <Panel title="Interviews" description={`${feedbackCount} with submitted feedback`}>
                  {interviews.length ? (
                    <ul className="divide-y divide-line border-t border-line">
                      {interviews.map((i) => (
                        <li key={i.id} className="space-y-3 px-5 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">{i.stageName}</p>
                              <p className="text-xs text-muted">
                                {formatDateTime(i.start)} · {i.mode}
                              </p>
                            </div>
                            <StatusBadge kind="interview" value={i.status} />
                          </div>
                          {i.feedback ? <FeedbackSummary interview={i} /> : i.status === 'completed' ? <p className="text-xs text-amber-700">Feedback has not been submitted yet.</p> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyState compact title="No interviews yet" />
                  )}
                </Panel>
                <Panel title="Assessments">
                  {assessments.length ? (
                    <ul className="divide-y divide-line border-t border-line">
                      {assessments.map((a) => {
                        const t = templatesById.get(a.templateId)
                        return (
                          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                            <div>
                              <p className="text-sm font-medium">{t?.name}</p>
                              <p className="text-xs text-muted">
                                Assigned {formatDate(a.assignedAt)} · Due {formatDate(a.deadline)} · Pass mark {t?.passMark}%
                              </p>
                            </div>
                            {a.score != null ? (
                              <span className={`text-sm font-semibold tabular ${a.score >= (t?.passMark ?? 60) ? 'text-emerald-700' : 'text-red-600'}`}>{a.score}%</span>
                            ) : (
                              <StatusBadge kind="assessment" value={a.status} />
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <EmptyState compact title="No assessments assigned" />
                  )}
                </Panel>
              </div>
            )}

            {tab === 'notes' && (
              <Panel bodyClassName="p-5">
                <NotesSection candidate={candidate} />
              </Panel>
            )}

            {tab === 'activity' && (
              <Panel bodyClassName="pt-5">
                <RecentActivity items={activities} limit={40} linkCandidates={false} />
              </Panel>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <Panel bodyClassName="p-5">
            <SectionTitle>Contact & details</SectionTitle>
            <ContactDetails candidate={candidate} />
          </Panel>
          <Panel bodyClassName="p-5">
            <SectionTitle>Resume</SectionTitle>
            <ResumeSection candidate={candidate} />
          </Panel>
          <Panel bodyClassName="p-5">
            <SectionTitle>Skills</SectionTitle>
            <SkillsList skills={candidate.skills} highlight={primary?.job.skills ?? []} />
            {primary && <p className="mt-3 text-xxs text-faint">Highlighted skills match {primary.job.title}.</p>}
          </Panel>
        </aside>
      </div>

      <AddApplicationModal open={adding} onClose={() => setAdding(false)} candidate={candidate} existingJobIds={apps.map((a) => a.job.id)} />
      <StageChangeDialog change={stageMove.change} job={stageMove.change?.job} onClose={stageMove.cancel} onConfirm={stageMove.confirm} loading={stageMove.pending} />
    </div>
  )
}
