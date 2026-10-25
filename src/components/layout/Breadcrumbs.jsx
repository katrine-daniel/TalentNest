import { Link, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { ROUTE_LABELS } from '@/config/navigation'
import { useLookups, fullName } from '@/hooks/useStore'
import { SETTINGS_SECTIONS } from '@/components/settings/SettingsNav'

/** Derives a breadcrumb trail from the current URL and the data store. */
export default function Breadcrumbs() {
  const { pathname } = useLocation()
  const { candidatesById, jobsById } = useLookups()
  const [section, id] = pathname.split('/').filter(Boolean)

  const crumbs = [{ label: ROUTE_LABELS[section ?? ''] ?? 'Not found', to: `/${section ?? ''}` }]
  if (id) {
    let label = id
    if (section === 'candidates') label = fullName(candidatesById.get(id))
    if (section === 'jobs') label = jobsById.get(id)?.title ?? 'Vacancy'
    if (section === 'settings') label = SETTINGS_SECTIONS.find((s) => s.id === id)?.label ?? id
    crumbs.push({ label, to: pathname })
  }

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <li key={c.to} className={i === 0 && crumbs.length > 1 ? 'hidden min-w-0 items-center gap-1 sm:flex' : 'flex min-w-0 items-center gap-1'}>
              {last ? (
                <span aria-current="page" className="truncate font-medium text-ink">
                  {c.label}
                </span>
              ) : (
                <>
                  <Link to={c.to} className="truncate text-muted hover:text-ink">
                    {c.label}
                  </Link>
                  <ChevronRight size={14} className="shrink-0 text-faint" aria-hidden />
                </>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
