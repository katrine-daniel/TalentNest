import { useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useAction, useDb } from '@/app/hooks'
import { useAuth, useSession } from '@/app/session'
import { ROLE_LABELS, PERMISSIONS, ROLE_PERMISSIONS } from '@/domain/permissions'
import { formatDateTime } from '@/lib/dates'
import { NOTIFICATION_KINDS, setPreference } from '@/services/notifications'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Form'
import { KeyValue, PageHeader, Panel, Tabs } from '@/components/ui/Layout'

function Password() {
  const [pw, setPw] = useState('')
  const save = useAction(async () => (await import('@/services/supabaseSession')).updatePassword(pw), 'Password updated')
  return (
    <Panel title="Password" bodyClassName="p-4">
      <form
        className="flex max-w-md items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if ((await save.run()).ok) setPw('')
        }}
      >
        <Field label="New password" hint="At least 10 characters." className="flex-1">
          {(a) => <Input {...a} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}
        </Field>
        <Button type="submit" variant="primary" loading={save.pending} disabled={pw.length < 10}>
          Update
        </Button>
      </form>
    </Panel>
  )
}

export default function SettingsPage() {
  const db = useDb()
  const { account, can } = useSession()
  const auth = useAuth()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? (location.pathname.endsWith('reset-password') ? 'security' : 'profile')
  const prefs = (kind: string) => db.notificationPrefs.find((p) => p.accountId === account.id && p.kind === kind)
  const pref = useAction((kind: (typeof NOTIFICATION_KINDS)[number]['kind'], ch: 'inApp' | 'email', v: boolean) => setPreference(account, kind, ch, v))
  const name = (id: string | null) => (id ? (db.accounts.find((a) => a.id === id)?.name ?? 'Unknown') : 'System')

  const tabs = [
    { value: 'profile', label: 'Profile' },
    { value: 'notifications', label: 'Notifications' },
    { value: 'security', label: 'Access & security' },
    ...(can('audit.view') ? [{ value: 'audit', label: 'Audit log' }] : []),
  ]
  return (
    <div>
      <PageHeader title="Settings" />
      <Tabs label="Settings sections" tabs={tabs} value={tab} onChange={(v) => setParams({ tab: v })} className="mb-5" />
      {tab === 'profile' && (
        <Panel title="Your account" bodyClassName="p-4">
          <KeyValue
            items={[
              ['Name', account.name],
              ['Email', account.email],
              ['Role', ROLE_LABELS[account.role]],
              ['Organization', db.organization.name],
              ['Sign-in', auth.mode === 'demo' ? 'Demo session (this browser, 12 hours)' : 'Supabase Auth'],
            ]}
          />
          <p className="text-muted mt-4 text-xs">To change your personal details, raise an “Update my personal details” request — HR verifies changes.</p>
        </Panel>
      )}
      {tab === 'notifications' && (
        <Panel title="Notification preferences">
          <table className="w-full text-sm">
            <caption className="sr-only">Notification preferences</caption>
            <thead>
              <tr className="border-line border-b">
                <th scope="col" className="text-muted px-4 py-2 text-left text-xs font-medium">
                  Topic
                </th>
                <th scope="col" className="text-muted px-4 py-2 text-xs font-medium">
                  In-app
                </th>
                <th scope="col" className="text-muted px-4 py-2 text-xs font-medium">
                  Email
                </th>
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_KINDS.map((k) => (
                <tr key={k.kind} className="border-line border-b last:border-0">
                  <td className="px-4 py-2">{k.label}</td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      className="accent-brand-600 size-4"
                      aria-label={`${k.label} in-app`}
                      checked={prefs(k.kind)?.inApp ?? true}
                      onChange={(e) => pref.run(k.kind, 'inApp', e.target.checked)}
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      className="accent-brand-600 size-4"
                      aria-label={`${k.label} email`}
                      checked={prefs(k.kind)?.email ?? false}
                      onChange={(e) => pref.run(k.kind, 'email', e.target.checked)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-muted px-4 py-3 text-xs">
            Email preferences are saved, but no email provider is connected in this deployment, so no emails are sent yet.
          </p>
        </Panel>
      )}
      {tab === 'security' && (
        <div className="space-y-5">
          {auth.mode === 'supabase' && <Password />}
          <Panel title={`What your role (${ROLE_LABELS[account.role]}) can do`}>
            <ul className="divide-line divide-y">
              {Object.entries(PERMISSIONS).map(([key, label]) => {
                const has = ROLE_PERMISSIONS[account.role].includes(key as keyof typeof PERMISSIONS)
                return (
                  <li key={key} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className={has ? '' : 'text-muted'}>{label}</span>
                    <span className={has ? 'text-success text-xs font-medium' : 'text-muted text-xs'}>{has ? 'Allowed' : 'Not allowed'}</span>
                  </li>
                )
              })}
            </ul>
            <p className="text-muted px-4 py-3 text-xs">
              Everyone can use self-service features: their own requests, leave, policies and the assistant. Managers also approve and see their reporting line.
            </p>
          </Panel>
        </div>
      )}
      {tab === 'audit' && can('audit.view') && (
        <Panel title="Audit log" actions={<span className="text-muted text-xs">Latest 200 events</span>}>
          <ul className="divide-line divide-y">
            {db.audit.slice(0, 200).map((a) => (
              <li key={a.id} className="px-4 py-2.5 text-sm">
                <p>
                  <span className="font-medium">{name(a.actorId)}</span> · <span className="text-ink-soft">{a.summary}</span>
                </p>
                <p className="text-muted text-xs">
                  {a.action} · {formatDateTime(a.at)}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
