import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpenText, CheckCircle2, Plus, Search } from 'lucide-react'
import { useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { formatDate } from '@/lib/dates'
import { acknowledgmentStats, currentVersion, hasUnpublishedChanges, isReviewDue, needsAcknowledgment, visiblePolicies } from '@/services/policies'
import { Badge } from '@/components/ui/Badge'
import { LinkButton } from '@/components/ui/Button'
import { Input, Select } from '@/components/ui/Form'
import { EmptyState, PageHeader, Panel } from '@/components/ui/Layout'
import { PolicyStatusBadge } from '@/features/shared/display'

export default function PoliciesPage() {
  const db = useDb()
  const { account, can } = useSession()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const policies = useMemo(() => visiblePolicies(db, account), [db, account])
  const pending = new Set(needsAcknowledgment(db, account).map((p) => p.id))
  const categories = [...new Set(policies.map((p) => p.category))].sort()
  const q = query.trim().toLowerCase()
  const rows = policies
    .filter((p) => (!category || p.category === category) && (!status || p.status === status))
    .filter((p) => !q || `${p.title} ${p.summary} ${p.tags.join(' ')} ${currentVersion(p)?.body ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => Number(pending.has(b.id)) - Number(pending.has(a.id)) || a.title.localeCompare(b.title))

  return (
    <div>
      <PageHeader
        title="Company Policies"
        description="The published version of each policy is the one in force — it is also what the assistant answers from."
        actions={
          can('policies.manage') && (
            <LinkButton to="/policies/new" variant="primary" icon={Plus}>
              New policy
            </LinkButton>
          )
        }
      />
      {pending.size > 0 && (
        <p className="bg-brand-50 text-brand-800 mb-4 rounded-md px-4 py-2.5 text-sm">
          {pending.size} polic{pending.size === 1 ? 'y needs' : 'ies need'} your acknowledgment — they are listed first.
        </p>
      )}
      <Panel>
        <div className="border-line flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="relative min-w-52 flex-1">
            <Search size={15} className="text-muted pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" aria-hidden />
            <Input
              aria-label="Search policies"
              placeholder="Search titles, tags and policy text"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Select
            aria-label="Category"
            className="w-auto"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="All categories"
            options={categories.map((c) => ({ value: c, label: c }))}
          />
          {can('policies.manage') && (
            <Select
              aria-label="Status"
              className="w-auto"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              placeholder="Any status"
              options={['draft', 'in_review', 'published', 'archived'].map((s) => ({ value: s, label: s.replace('_', ' ') }))}
            />
          )}
        </div>
        {rows.length ? (
          <ul className="divide-line divide-y">
            {rows.map((p) => {
              const v = currentVersion(p)
              const stats = can('policies.manage') ? acknowledgmentStats(db, p) : null
              return (
                <li key={p.id}>
                  <Link to={`/policies/${p.id}`} className="hover:bg-page flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center">
                    <BookOpenText size={18} className="text-muted hidden shrink-0 sm:block" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{p.title}</span>
                        {can('policies.manage') && <PolicyStatusBadge status={p.status} />}
                        {can('policies.manage') && p.status === 'published' && hasUnpublishedChanges(p) && <Badge tone="warning">Unpublished changes</Badge>}
                        {isReviewDue(p) && can('policies.manage') && <Badge tone="danger">Review due</Badge>}
                        {pending.has(p.id) && <Badge tone="brand">Acknowledge</Badge>}
                      </span>
                      <span className="text-muted block text-xs">{p.summary}</span>
                    </span>
                    <span className="text-muted shrink-0 text-xs sm:text-right">
                      {p.category}
                      {v && (
                        <span className="block">
                          v{v.version} · effective {formatDate(v.effectiveDate)}
                        </span>
                      )}
                      {stats && (
                        <span className="block">
                          <CheckCircle2 size={11} className="mr-1 inline" aria-hidden />
                          {stats.acknowledged}/{stats.audience} acknowledged
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState icon={BookOpenText} title="No policies match" />
        )}
      </Panel>
    </div>
  )
}
