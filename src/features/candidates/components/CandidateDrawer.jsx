import { ExternalLink } from 'lucide-react'
import Drawer from '@/components/ui/Drawer'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import EmptyState from '@/components/ui/EmptyState'
import ApplicationCard from './ApplicationCard'
import StageChangeDialog from '@/features/pipeline/components/StageChangeDialog'
import { ContactDetails, NotesSection, SectionTitle, SkillsList } from './CandidateProfile'
import { useCandidateActions, useCandidateDetails } from '@/features/candidates/hooks/useCandidates'
import { useStageMove } from '@/features/pipeline/hooks/useStageMove'
import { fullName } from '@/hooks/useStore'

/**
 * Quick view used from the candidate list and the pipeline board.
 * `focusApplicationId` puts that application first (e.g. the board's vacancy).
 */
export default function CandidateDrawer({ candidateId, open, onClose, focusApplicationId, moveFn }) {
  const details = useCandidateDetails(candidateId)
  const actions = useCandidateActions()
  const stageMove = useStageMove(moveFn ?? actions.moveStage.run)

  const candidate = details?.candidate
  const apps = details ? [...details.apps].sort((a, b) => (a.app.id === focusApplicationId ? -1 : b.app.id === focusApplicationId ? 1 : 0)) : []

  return (
    <>
      <Drawer
        open={open && Boolean(candidate)}
        onClose={onClose}
        title={candidate ? fullName(candidate) : ''}
        subtitle={candidate ? `${candidate.ref} · ${candidate.currentTitle}` : ''}
        headerActions={
          candidate && (
            <Button size="sm" variant="secondary" icon={ExternalLink} to={`/candidates/${candidate.id}`} onClick={onClose}>
              Full profile
            </Button>
          )
        }
      >
        {candidate && (
          <div className="space-y-7 p-5">
            <div className="flex items-center gap-4">
              <Avatar name={fullName(candidate)} size="lg" />
              <div className="min-w-0 text-sm">
                <p className="text-muted">
                  {candidate.currentTitle}
                  {candidate.currentCompany !== '—' && ` at ${candidate.currentCompany}`}
                </p>
                <p className="text-muted">{candidate.experienceYears} years experience</p>
              </div>
            </div>
            <section>
              <SectionTitle>Applications ({apps.length})</SectionTitle>
              {apps.length ? (
                <div className="space-y-3">
                  {apps.map((entry) => (
                    <ApplicationCard key={entry.app.id} entry={entry} candidateName={fullName(candidate)} onRequestMove={stageMove.request} />
                  ))}
                </div>
              ) : (
                <EmptyState compact title="No applications" description="Add this candidate to a vacancy from their full profile." />
              )}
            </section>
            <section>
              <SectionTitle>Skills</SectionTitle>
              <SkillsList skills={candidate.skills} highlight={apps[0]?.job.skills ?? []} />
            </section>
            <section>
              <SectionTitle>Contact & details</SectionTitle>
              <ContactDetails candidate={candidate} />
            </section>
            <section>
              <SectionTitle>Recruiter notes</SectionTitle>
              <NotesSection candidate={candidate} limit={3} />
            </section>
          </div>
        )}
      </Drawer>
      <StageChangeDialog
        change={stageMove.change}
        job={stageMove.change?.job}
        onClose={stageMove.cancel}
        onConfirm={stageMove.confirm}
        loading={stageMove.pending}
      />
    </>
  )
}
