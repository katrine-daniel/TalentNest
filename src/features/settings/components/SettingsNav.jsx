import { NavLink } from 'react-router-dom'
import { Bell, Building2, ClipboardCheck, Database, GitBranch, ListChecks, ShieldCheck, Users } from 'lucide-react'
import { cn } from '@/utils/cn'

export const SETTINGS_SECTIONS = [
  { id: 'users', label: 'Users', icon: Users, description: 'Invite teammates and manage access' },
  { id: 'roles', label: 'Roles & permissions', icon: ShieldCheck, description: 'What each role can do in the interface' },
  { id: 'departments', label: 'Departments', icon: Building2, description: 'Business units and their heads' },
  { id: 'workflows', label: 'Workflow templates', icon: GitBranch, description: 'Reusable recruitment stage sequences' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Email and in-app alerts' },
  { id: 'assessments', label: 'Assessment templates', icon: ClipboardCheck, description: 'Tests, durations and pass marks' },
  { id: 'scorecards', label: 'Interview scorecards', icon: ListChecks, description: 'Evaluation criteria and weights' },
  { id: 'data', label: 'Demo data', icon: Database, description: 'Reset the sample data set' },
]

/** Vertical settings navigation on desktop; horizontal scrolling tabs on smaller screens. */
export default function SettingsNav() {
  return (
    <nav aria-label="Settings sections" className="no-scrollbar -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
      <ul className="flex gap-1 border-b border-line lg:flex-col lg:border-b-0">
        {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => (
          <li key={id} className="shrink-0">
            <NavLink
              to={`/settings/${id}`}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2.5 text-sm whitespace-nowrap transition-colors lg:rounded-lg lg:py-2',
                  isActive ? 'border-b-2 border-brand-600 font-medium text-brand-700 lg:border-b-0 lg:bg-brand-50' : 'border-b-2 border-transparent text-ink-soft hover:text-ink lg:border-b-0 lg:hover:bg-subtle',
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
