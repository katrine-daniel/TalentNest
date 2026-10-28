import { useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@/utils/cn'
import { NAV_SECTIONS, SETTINGS_NAV } from '@/config/navigation'
import { useCollection } from '@/hooks/useStore'
import { useSession } from '@/app/providers/SessionContext'
import { feedbackCompletion } from '@/features/interviews/feedbackSelectors'
import { isTaskOverdue } from '@/features/tasks/taskService'

/** Counts that need the signed-in user's attention. */
function useNavBadges() {
  const interviews = useCollection('interviews')
  const feedback = useCollection('interviewFeedback')
  const assessments = useCollection('assessments')
  const requisitions = useCollection('requisitions')
  const tasks = useCollection('tasks')
  const { actorId, role } = useSession()
  return useMemo(
    () => ({
      // Interviews where *this* user still owes a scorecard.
      feedback: interviews.filter((i) => i.status === 'completed' && feedbackCompletion(i, feedback).pendingInterviewerIds.includes(actorId)).length,
      assessments: assessments.filter((a) => a.status === 'submitted').length,
      requisitions: requisitions.filter((r) => r.status === 'pending' && (r.approverId === actorId || role === 'Admin')).length,
      tasks: tasks.filter((t) => t.assigneeId === actorId && isTaskOverdue(t)).length,
    }),
    [interviews, feedback, assessments, requisitions, tasks, actorId, role],
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
              isActive ? 'text-brand-700 font-medium' : 'text-ink-soft hover:bg-subtle hover:text-ink',
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
                  className="bg-brand-50 absolute inset-0 rounded-lg"
                  transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                  aria-hidden
                />
              )}
              <Icon
                size={17}
                strokeWidth={isActive ? 2.2 : 1.9}
                className={cn('relative shrink-0', isActive ? 'text-brand-600' : 'text-muted group-hover:text-ink')}
                aria-hidden
              />
              {!collapsed && <span className="relative truncate">{item.label}</span>}
              {badge > 0 &&
                (collapsed ? (
                  <span className="bg-brand-600 absolute top-1.5 right-2 h-1.5 w-1.5 rounded-full" aria-label={`${badge} pending`} />
                ) : (
                  <span
                    className="bg-brand-600 tabular relative ml-auto rounded px-1.5 text-[10px] leading-4 font-semibold text-white"
                    aria-label={`${badge} pending`}
                  >
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
    <nav aria-label="Main" className="flex flex-1 scrollbar-thin flex-col gap-5 overflow-y-auto px-3 py-2">
      {NAV_SECTIONS.map((section) => (
        <div key={section.label}>
          {!collapsed ? (
            <p className="text-faint mb-1 px-3 text-[10px] font-semibold tracking-wider uppercase">{section.label}</p>
          ) : (
            <div className="bg-line mx-auto mb-2 h-px w-6" aria-hidden />
          )}
          <ul className="space-y-0.5">{section.items.map(renderItem)}</ul>
        </div>
      ))}
      <div className="border-line mt-auto border-t pt-3">
        <ul>{renderItem(SETTINGS_NAV)}</ul>
      </div>
    </nav>
  )
}
