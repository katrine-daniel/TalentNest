import {
  LayoutDashboard,
  Users,
  BriefcaseBusiness,
  Columns3,
  ClipboardCheck,
  CalendarDays,
  FileSignature,
  BarChart3,
  Sparkles,
  Settings,
  FileCheck2,
  Library,
  Scale,
  ListTodo,
  Workflow,
  UserRoundCheck,
} from 'lucide-react'

export const NAV_SECTIONS = [
  {
    label: 'Recruitment',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/requisitions', label: 'Requisitions', icon: FileCheck2, badge: 'requisitions' },
      { to: '/jobs', label: 'Jobs & Vacancies', icon: BriefcaseBusiness },
      { to: '/candidates', label: 'Candidates', icon: Users },
      { to: '/pipeline', label: 'Recruitment Pipeline', icon: Columns3 },
      { to: '/talent', label: 'Talent Pools', icon: Library },
    ],
  },
  {
    label: 'Evaluation',
    items: [
      { to: '/assessments', label: 'Assessments', icon: ClipboardCheck, badge: 'assessments' },
      { to: '/calendar', label: 'Interviews & Calendar', icon: CalendarDays, badge: 'feedback' },
      { to: '/compare', label: 'Compare Candidates', icon: Scale },
      { to: '/offers', label: 'Offers', icon: FileSignature },
      { to: '/onboarding', label: 'Onboarding', icon: UserRoundCheck },
    ],
  },
  {
    label: 'Team & insights',
    items: [
      { to: '/tasks', label: 'Tasks', icon: ListTodo, badge: 'tasks' },
      { to: '/automation', label: 'Automation', icon: Workflow, permission: 'automation.manage' },
      { to: '/analytics', label: 'Reports & Analytics', icon: BarChart3, permission: 'analytics.view' },
      { to: '/ai-assistant', label: 'AI Hiring Assistant', icon: Sparkles, permission: 'ai.use' },
    ],
  },
]

export const SETTINGS_NAV = { to: '/settings', label: 'Settings', icon: Settings }

export const ROUTE_LABELS = {
  '': 'Overview',
  requisitions: 'Requisitions',
  candidates: 'Candidates',
  jobs: 'Jobs & Vacancies',
  pipeline: 'Recruitment Pipeline',
  talent: 'Talent Pools',
  assessments: 'Assessments',
  calendar: 'Interviews & Calendar',
  compare: 'Compare Candidates',
  offers: 'Offers',
  onboarding: 'Onboarding',
  tasks: 'Tasks',
  automation: 'Automation',
  analytics: 'Reports & Analytics',
  'ai-assistant': 'AI Hiring Assistant',
  settings: 'Settings',
}
