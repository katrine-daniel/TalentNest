import { NavLink } from 'react-router-dom'
import { Bell, Building2, ClipboardCheck, Database, GitBranch, ListChecks, Rocket, ShieldCheck, Users } from 'lucide-react'
import { cn } from '@/utils/cn'

export const SETTINGS_SECTIONS = [
  { id: 'users', label: 'Users', icon: Users, description: 'Invite teammates and manage access' },
  { id: 'roles', label: 'Roles & permissions', icon: ShieldCheck, description: 'What each role can do in the interface' },
  { id: 'departments', label: 'Departments', icon: Building2, description: 'Business units and their heads' },
  { id: 'workflows', label: 'Workflow templates', icon: GitBranch, description: 'Reusable recruitment stage sequences' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Email and in-app alerts' },
  { id: 'assessments', label: 'Assessment templates', icon: ClipboardCheck, description: 'Tests, durations and pass marks' },
  { id: 'scorecards', label: 'Interview scorecards', icon: ListChecks, description: 'Evaluation criteria and weights' },
  { id: 'onboarding', label: 'Onboarding checklists', icon: Rocket, description: 'Reusable new-hire checklists and owners' },
  { id: 'data', label: 'Demo data', icon: Database, description: 'Reset the sample data set', demoOnly: true },
]

/** Vertical settings navigation on desktop; horizontal scrolling tabs on smaller screens. */
export default function SettingsNav({ sections = SETTINGS_SECTIONS }) {
  return (
    <nav aria-label="Settings sections" className="no-scrollbar -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="border-line flex gap-1 border-b lg:flex-col lg:border-b-0">
        {sections.map(({ id, label, icon: Icon }) => (
          <li key={id} className="shrink-0">
            <NavLink
              to={`/settings/${id}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2.5 text-sm whitespace-nowrap transition-colors lg:rounded-lg lg:py-2',
                  isActive
                    ? 'border-brand-600 text-brand-700 lg:bg-brand-50 border-b-2 font-medium lg:border-b-0'
                    : 'text-ink-soft hover:text-ink lg:hover:bg-subtle border-b-2 border-transparent lg:border-b-0',
                )
              }
            >
              <Icon size={16} className="shrink-0" aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
