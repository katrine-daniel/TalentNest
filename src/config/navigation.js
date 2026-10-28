import { LayoutDashboard, Users, BriefcaseBusiness, Columns3, ClipboardCheck, CalendarDays, FileSignature, BarChart3, Sparkles, Settings } from 'lucide-react'

export const NAV_SECTIONS = [
  {
    label: 'Recruitment',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/candidates', label: 'Candidates', icon: Users },
      { to: '/jobs', label: 'Jobs & Vacancies', icon: BriefcaseBusiness },
      { to: '/pipeline', label: 'Recruitment Pipeline', icon: Columns3 },
    ],
  },
  {
    label: 'Evaluation',
    items: [
      { to: '/assessments', label: 'Assessments', icon: ClipboardCheck, badge: 'assessments' },
      { to: '/calendar', label: 'Interviews & Calendar', icon: CalendarDays, badge: 'feedback' },
      { to: '/offers', label: 'Offers & Onboarding', icon: FileSignature },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/analytics', label: 'Reports & Analytics', icon: BarChart3, permission: 'analytics.view' },
      { to: '/ai-assistant', label: 'AI Hiring Assistant', icon: Sparkles, permission: 'ai.use' },
    ],
  },
]

export const SETTINGS_NAV = { to: '/settings', label: 'Settings', icon: Settings }

export const ROUTE_LABELS = {
  '': 'Overview',
  candidates: 'Candidates',
  jobs: 'Jobs & Vacancies',
  pipeline: 'Recruitment Pipeline',
  assessments: 'Assessments',
  calendar: 'Interviews & Calendar',
  offers: 'Offers & Onboarding',
  analytics: 'Reports & Analytics',
  'ai-assistant': 'AI Hiring Assistant',
  settings: 'Settings',
}
