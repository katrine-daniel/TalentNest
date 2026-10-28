import { useMemo, useState } from 'react'
import Avatar from '@/components/ui/Avatar'
import SearchInput from '@/components/ui/SearchInput'
import { useCollection } from '@/hooks/useStore'
import { cn } from '@/utils/cn'

/** Multi-select list of interviewers; people from the vacancy's department are listed first. */
export default function InterviewerPicker({ value = [], onChange, departmentId, invalid, id }) {
  const users = useCollection('users')
  const [query, setQuery] = useState('')

  const list = useMemo(() => {
    const q = query.toLowerCase()
    return users
      .filter((u) => u.status === 'active' && (!q || u.name.toLowerCase().includes(q) || u.title.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.departmentId === departmentId) - Number(a.departmentId === departmentId) || a.name.localeCompare(b.name))
  }, [users, query, departmentId])

  const toggle = (uid) => onChange(value.includes(uid) ? value.filter((x) => x !== uid) : [...value, uid])

  return (
    <div className={cn('rounded-lg border', invalid ? 'border-red-400' : 'border-line-strong')}>
      <div className="border-b border-line p-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Find interviewer" label="Find interviewer" id={id} />
      </div>
      <ul className="max-h-44 overflow-y-auto p-1 scrollbar-thin" role="group" aria-label="Interviewers">
        {list.map((u) => {
          const checked = value.includes(u.id)
          return (
            <li key={u.id}>
              <label className={cn('flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5', checked ? 'bg-brand-50' : 'hover:bg-subtle')}>
                <input type="checkbox" checked={checked} onChange={() => toggle(u.id)} className="h-4 w-4 accent-brand-600" />
                <Avatar name={u.name} size="xs" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{u.name}</span>
                  <span className="block truncate text-xxs text-muted">{u.title}</span>
                </span>
                {u.departmentId === departmentId && <span className="text-[10px] text-brand-600">Dept.</span>}
              </label>
            </li>
          )
        })}
        {!list.length && <li className="px-2 py-3 text-xs text-muted">No interviewers match.</li>}
      </ul>
    </div>
  )
}
