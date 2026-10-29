import {
  BarChart3,
  BookOpenText,
  Building2,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  Plug,
  Settings,
  Sparkles,
  UserRoundCheck,
  Users,
  Workflow,
  CalendarDays,
  type LucideIcon,
} from 'lucide-react'
import type { Permission } from '@/domain/permissions'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Hidden unless the user has this permission. */
  permission?: Permission
  /** Shown to managers and HR (people with teams or queues). */
  managersAndHR?: boolean
  badge?: 'inbox' | 'requests' | 'leave'
}

export interface NavGroup {
  label: string | null
  items: NavItem[]
}

export const NAVIGATION: NavGroup[] = [
  {
    label: null,
    items: [
      { to: '/', label: 'My Workspace', icon: LayoutDashboard },
      { to: '/assistant', label: 'AI Assistant', icon: Sparkles },
      { to: '/inbox', label: 'HR Inbox', icon: Inbox, badge: 'inbox' },
    ],
  },
  {
    label: 'People operations',
    items: [
      { to: '/people', label: 'People', icon: Users },
      { to: '/requests', label: 'Employee Requests', icon: ClipboardList, badge: 'requests' },
      { to: '/leave', label: 'Leave & Attendance', icon: CalendarDays, badge: 'leave' },
      { to: '/lifecycle', label: 'Onboarding & Offboarding', icon: UserRoundCheck, managersAndHR: true },
    ],
  },
  {
    label: 'Knowledge & insight',
    items: [
      { to: '/policies', label: 'Company Policies', icon: BookOpenText },
      { to: '/analytics', label: 'Workforce Analytics', icon: BarChart3, permission: 'analytics.view' },
      { to: '/automation', label: 'Workflows & Automation', icon: Workflow, permission: 'automation.manage' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/organization', label: 'Organization', icon: Building2, permission: 'org.manage' },
      { to: '/integrations', label: 'Integrations', icon: Plug, permission: 'org.manage' },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export const ROUTE_TITLES: Record<string, string> = {
  '': 'My Workspace',
  assistant: 'AI Assistant',
  inbox: 'HR Inbox',
  people: 'People',
  requests: 'Employee Requests',
  leave: 'Leave & Attendance',
  lifecycle: 'Onboarding & Offboarding',
  policies: 'Company Policies',
  analytics: 'Workforce Analytics',
  automation: 'Workflows & Automation',
  organization: 'Organization',
  integrations: 'Integrations',
  settings: 'Settings',
}
