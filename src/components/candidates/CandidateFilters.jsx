import { useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import SearchInput from '@/components/ui/SearchInput'
import { FilterSelect } from '@/components/ui/FormControls'
import { useOrgOptions } from '@/hooks/useJobs'
import { useCollection } from '@/hooks/useStore'
import { EXPERIENCE_BUCKETS, STATUS_FILTERS } from '@/hooks/useCandidates'

/**
 * Search + filters. Inline selects on large screens; a filter sheet on smaller screens
 * so the toolbar never overflows.
 */
export default function CandidateFilters({ filters, setFilter, reset, activeCount }) {
  const options = useOrgOptions()
  const [sheetOpen, setSheetOpen] = useState(false)
  const jobs = useCollection('jobs')
  const jobOptions = jobs.filter((j) => filters.department === 'all' || j.departmentId === filters.department).map((j) => ({ value: j.id, label: j.title }))

  const selects = (
    <>
      <FilterSelect label="Department" value={filters.department} onChange={(v) => setFilter('department', v)} options={options.departments} />
      <FilterSelect label="Job" value={filters.job} onChange={(v) => setFilter('job', v)} options={jobOptions} />
      <FilterSelect label="Recruiter" value={filters.recruiter} onChange={(v) => setFilter('recruiter', v)} options={options.recruiters} />
      <FilterSelect label="Experience" value={filters.experience} onChange={(v) => setFilter('experience', v)} options={EXPERIENCE_BUCKETS} allLabel="Any" />
      <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilter('status', v)} options={STATUS_FILTERS} allLabel="Any" />
    </>
  )

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <SearchInput value={filters.q} onChange={(v) => setFilter('q', v)} placeholder="Search name, email, skill or ID" label="Search candidates" className="flex-1 xl:max-w-sm" />
        <Button icon={SlidersHorizontal} onClick={() => setSheetOpen(true)} className="xl:hidden" aria-label={`Filters${activeCount ? `, ${activeCount} active` : ''}`}>
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && <span className="rounded bg-brand-600 px-1.5 text-[10px] text-white">{activeCount}</span>}
        </Button>
        <div className="hidden flex-1 gap-2 xl:grid xl:grid-cols-5">{selects}</div>
        {activeCount > 0 && (
          <Button variant="ghost" icon={X} onClick={reset} className="max-xl:hidden">
            Clear
          </Button>
        )}
      </div>

      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filter candidates"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={reset} disabled={!activeCount}>
              Clear all
            </Button>
            <Button variant="primary" onClick={() => setSheetOpen(false)}>
              Show results
            </Button>
          </>
        }
      >
        <div className="grid gap-3">{selects}</div>
      </Modal>
    </div>
  )
}
