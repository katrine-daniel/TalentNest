import { useEffect, useState } from 'react'
import Button from '@/components/ui/Button'
import MockNotice from '@/components/ui/MockNotice'
import { Toggle } from '@/components/ui/FormControls'
import { useSettings } from '@/hooks/useStore'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { settingsService } from '@/features/settings/settingsService'

export default function NotificationSettings({ readOnly }) {
  const settings = useSettings()
  const [prefs, setPrefs] = useState(settings.notificationPrefs)
  const save = useAsyncAction(settingsService.saveNotificationPrefs, { success: 'Notification preferences saved' })
  useEffect(() => setPrefs(settings.notificationPrefs), [settings.notificationPrefs])
  const dirty = JSON.stringify(prefs) !== JSON.stringify(settings.notificationPrefs)

  const set = (key, channel, value) => setPrefs((list) => list.map((p) => (p.key === key ? { ...p, [channel]: value } : p)))

  return (
    <div className="space-y-4">
      <div className="border-line/80 bg-surface shadow-card rounded-2xl border">
        <div className="border-line text-xxs text-muted flex items-center justify-end gap-6 border-b px-5 py-2.5 font-medium tracking-wide uppercase">
          <span className="w-11 text-center">Email</span>
          <span className="w-11 text-center">In-app</span>
        </div>
        <ul className="divide-line divide-y">
          {prefs.map((p) => (
            <li key={p.key} className="flex items-center gap-4 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{p.label}</p>
                <p className="text-muted text-xs">{p.description}</p>
              </div>
              <Toggle checked={p.email} onChange={(v) => set(p.key, 'email', v)} label={`${p.label} by email`} disabled={readOnly} />
              <Toggle checked={p.inApp} onChange={(v) => set(p.key, 'inApp', v)} label={`${p.label} in app`} disabled={readOnly} />
            </li>
          ))}
        </ul>
      </div>
      <MockNotice>Email delivery requires the notification backend. Preferences are stored in this browser for the demo.</MockNotice>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setPrefs(settings.notificationPrefs)} disabled={!dirty}>
          Discard
        </Button>
        <Button variant="primary" onClick={() => save.run(prefs)} disabled={!dirty || readOnly} loading={save.pending}>
          Save preferences
        </Button>
      </div>
    </div>
  )
}
