import { CalendarDays, Database, HardDrive, KeyRound, Mail, Plug, Sparkles, Wallet, type LucideIcon } from 'lucide-react'
import { env, isSupabaseConfigured } from '@/config/env'
import { Badge } from '@/components/ui/Badge'
import { PageHeader, Panel } from '@/components/ui/Layout'

interface Integration {
  name: string
  icon: LucideIcon
  connected: boolean
  what: string
  setup: string
}

/** Connection status is derived from real configuration — nothing here is shown as connected unless it is. */
const INTEGRATIONS: Integration[] = [
  {
    name: 'Supabase (database, auth, storage)',
    icon: Database,
    connected: isSupabaseConfigured,
    what: 'Shared persistent data, sign-in, row-level security and private document storage.',
    setup: 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, apply supabase/migrations. See docs/deployment.md.',
  },
  {
    name: 'AI provider',
    icon: Sparkles,
    connected: Boolean(env.assistantUrl),
    what: 'Answers in the AI Assistant generated server-side from records the user may access.',
    setup: 'Deploy the assistant Edge Function with the provider key as a function secret, then set VITE_ASSISTANT_URL.',
  },
  {
    name: 'Document storage',
    icon: HardDrive,
    connected: isSupabaseConfigured,
    what: 'Private bucket for attachments and employee documents with signed, short-lived download links.',
    setup: 'Provided by Supabase Storage once Supabase is connected. Without it, demo files stay in this browser.',
  },
  {
    name: 'Email provider',
    icon: Mail,
    connected: false,
    what: 'Email notifications and the “Send an email” automation action.',
    setup: 'Not available in this build. Email actions are recorded as skipped until a provider is integrated server-side.',
  },
  {
    name: 'Google Calendar / Microsoft Outlook',
    icon: CalendarDays,
    connected: false,
    what: 'Would publish approved leave and onboarding milestones to calendars.',
    setup: 'Not built. Requires OAuth app registration and a server-side sync job.',
  },
  {
    name: 'Identity provider (SSO)',
    icon: KeyRound,
    connected: false,
    what: 'Single sign-on through your company directory.',
    setup: 'Configure SAML/OIDC in Supabase Auth (paid plans), then map users to memberships.',
  },
  {
    name: 'HRIS / payroll system',
    icon: Wallet,
    connected: false,
    what: 'Would sync employee records and pay data. Offboarding “final pay” tasks are confirmed manually today.',
    setup: 'Not built. Requires the vendor API and a server-side connector.',
  },
]

export default function IntegrationsPage() {
  return (
    <div>
      <PageHeader
        title="Integrations"
        description="Status reflects this deployment’s actual configuration. Nothing is shown as connected unless it is configured, and no external action is reported as done without an integration."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {INTEGRATIONS.map((i) => (
          <Panel key={i.name} bodyClassName="flex gap-4 p-4">
            <span className="bg-subtle text-ink-soft grid size-10 shrink-0 place-items-center rounded-md">
              <i.icon size={18} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{i.name}</p>
                <Badge tone={i.connected ? 'success' : 'neutral'} dot>
                  {i.connected ? 'Configured' : 'Not connected'}
                </Badge>
              </div>
              <p className="text-ink-soft mt-1 text-sm">{i.what}</p>
              <p className="text-muted mt-2 text-xs">
                <Plug size={11} className="mr-1 inline" aria-hidden />
                {i.setup}
              </p>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}
