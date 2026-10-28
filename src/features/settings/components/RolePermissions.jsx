import { useEffect, useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import Button from '@/components/ui/Button'
import MockNotice from '@/components/ui/MockNotice'
import { useSettings } from '@/hooks/useStore'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { settingsService } from '@/features/settings/settingsService'
import { PERMISSIONS, ROLES } from '@/utils/permissions'

/** Role × permission matrix. Admin always has full access. */
export default function RolePermissions({ readOnly }) {
  const settings = useSettings()
  const save = useAsyncAction(settingsService.setRolePermissions, { success: 'Permissions saved' })
  const [matrix, setMatrix] = useState(settings.rolePermissions)
  useEffect(() => setMatrix(settings.rolePermissions), [settings.rolePermissions])

  const dirty = JSON.stringify(matrix) !== JSON.stringify(settings.rolePermissions)
  const groups = useMemo(() => [...new Set(PERMISSIONS.map((p) => p.group))], [])

  const toggle = (role, key) =>
    setMatrix((m) => {
      const has = m[role]?.includes(key)
      return { ...m, [role]: has ? m[role].filter((k) => k !== key) : [...(m[role] ?? []), key] }
    })

  return (
    <div className="space-y-4">
      <MockNotice>
        These permissions control which actions the interface offers. Real authorization must also be enforced by the backend for every request.
      </MockNotice>
      <div className="border-line/80 bg-surface shadow-card scrollbar-thin overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-line border-b">
              <th scope="col" className="text-xxs text-muted px-5 py-3 text-left font-medium tracking-wide uppercase">
                Permission
              </th>
              {ROLES.map((r) => (
                <th key={r} scope="col" className="px-3 py-3 text-center text-xs font-medium">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <FragmentRows key={group} group={group} matrix={matrix} toggle={toggle} readOnly={readOnly} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setMatrix(settings.rolePermissions)} disabled={!dirty}>
          Discard
        </Button>
        <Button variant="primary" onClick={() => save.run(matrix)} disabled={!dirty || readOnly} loading={save.pending}>
          Save permissions
        </Button>
      </div>
    </div>
  )
}

function FragmentRows({ group, matrix, toggle, readOnly }) {
  const perms = PERMISSIONS.filter((p) => p.group === group)
  return (
    <>
      <tr className="bg-subtle/60">
        <th colSpan={ROLES.length + 1} scope="colgroup" className="text-xxs text-muted px-5 py-1.5 text-left font-semibold tracking-wide uppercase">
          {group}
        </th>
      </tr>
      {perms.map((p) => (
        <tr key={p.key} className="border-line border-b last:border-0">
          <th scope="row" className="text-ink px-5 py-2.5 text-left font-normal">
            {p.label}
          </th>
          {ROLES.map((role) => (
            <td key={role} className="px-3 py-2.5 text-center">
              {role === 'Admin' ? (
                <Lock size={14} className="text-faint mx-auto" aria-label="Admin always has this permission" />
              ) : (
                <input
                  type="checkbox"
                  className="accent-brand-600 h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                  checked={Boolean(matrix[role]?.includes(p.key))}
                  disabled={readOnly}
                  onChange={() => toggle(role, p.key)}
                  aria-label={`${role}: ${p.label}`}
                />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
