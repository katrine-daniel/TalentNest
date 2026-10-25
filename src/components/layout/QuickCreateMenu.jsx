import { BriefcaseBusiness, CalendarPlus, ClipboardCheck, FileSignature, Plus, UserPlus } from 'lucide-react'
import Dropdown from '@/components/ui/Dropdown'
import Button from '@/components/ui/Button'
import { useGlobalActions } from '@/context/GlobalActionsContext'
import { useSession } from '@/context/SessionContext'

export default function QuickCreateMenu() {
  const actions = useGlobalActions()
  const { can, role } = useSession()
  const denied = `Not available for the ${role} role`

  const items = [
    { heading: 'Create' },
    { label: 'Candidate', description: 'Add a profile and resume', icon: UserPlus, onSelect: () => actions.openCandidateForm(), disabled: !can('candidates.manage'), disabledReason: denied },
    { label: 'Vacancy', description: 'Publish a new job opening', icon: BriefcaseBusiness, onSelect: () => actions.openJobForm(), disabled: !can('jobs.manage'), disabledReason: denied },
    { divider: true },
    { label: 'Schedule interview', icon: CalendarPlus, onSelect: () => actions.openSchedule(), disabled: !can('interviews.schedule'), disabledReason: denied },
    { label: 'Assign assessment', icon: ClipboardCheck, onSelect: () => actions.openAssessment(), disabled: !can('interviews.schedule'), disabledReason: denied },
    { label: 'Create offer', icon: FileSignature, onSelect: () => actions.openOffer(), disabled: !can('offers.manage'), disabledReason: denied },
  ]

  return (
    <Dropdown
      items={items}
      menuLabel="Quick create"
      className="w-60"
      renderTrigger={(props) => (
        <Button {...props} variant="primary" icon={Plus} aria-label="Create new" className="w-10 px-0 sm:w-auto sm:px-3.5">
          <span className="hidden sm:inline">New</span>
        </Button>
      )}
    />
  )
}
