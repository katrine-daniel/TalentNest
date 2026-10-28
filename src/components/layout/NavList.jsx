import { useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'
import { NAV_SECTIONS, SETTINGS_NAV } from '@/config/navigation'
import { useCollection } from '@/hooks/useStore'
import { useSession } from '@/app/providers/SessionContext'

function useNavBadges() {
  const interviews = useCollection('interviews')
  const assessments = useCollection('assessments')
  return useMemo(
    () => ({
      feedback: interviews.filter((i) => i.status === 'completed' && !i.feedback).length,
      assessments: assessments.filter((a) => a.status === 'submitted').length,
    }),
    [interviews, assessments],
  )
}

/** Navigation list shared by the desktop sidebar and the mobile drawer. */
export default function NavList({ collapsed = false, onNavigate, layoutGroup = 'nav' }) {
  const badges = useNavBadges()
  const { can } = useSession()

  const renderItem = (item) => {
    const Icon = item.icon
    const badge = item.badge ? badges[item.badge] : 0
    const locked = item.permission && !can(item.permission)
    return (
      <li key={item.to}>
        <NavLink
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          aria-label={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            cn(
              'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-[13px] transition-colors duration-150 sm:h-9',
              isActive ? 'font-medium text-brand-700' : 'text-ink-soft hover:bg-subtle hover:text-ink',
              collapsed && 'justify-center px-0',
              locked && 'opacity-60',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId={`${layoutGroup}-active`}
                  className="absolute inset-0 rounded-lg bg-brand-50"
                  transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                  aria-hidden
                />
              )}
              <Icon size={17} strokeWidth={isActive ? 2.2 : 1.9} className={cn('relative shrink-0', isActive ? 'text-brand-600' : 'text-muted group-hover:text-ink')} aria-hidden />
              {!collapsed && <span className="relative truncate">{item.label}</span>}
              {badge > 0 &&
                (collapsed ? (
                  <span className="absolute top-1.5 right-2 h-1.5 w-1.5 rounded-full bg-brand-600" aria-label={`${badge} pending`} />
                ) : (
                  <span className="relative ml-auto rounded bg-brand-600 px-1.5 text-[10px] leading-4 font-semibold text-white tabular" aria-label={`${badge} pending`}>
                    {badge}
                  </span>
                ))}
            </>
          )}
        </NavLink>
      </li>
    )
  }

  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-2 scrollbar-thin">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label}>
          {!collapsed ? (
            <p className="mb-1 px-3 text-[10px] font-semibold tracking-wider text-faint uppercase">{section.label}</p>
          ) : (
            <div className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden />
          )}
          <ul className="space-y-0.5">{section.items.map(renderItem)}</ul>
        </div>
      ))}
      <div className="mt-auto border-t border-line pt-3">
        <ul>{renderItem(SETTINGS_NAV)}</ul>
      </div>
    </nav>
  )
}
