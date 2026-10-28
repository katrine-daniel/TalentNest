import { useState } from 'react'
import { ArrowRight, FlaskConical, Loader2 } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import { mockUsers } from '@/data/mockOrganization'
import { useAuth } from '@/app/providers/AuthProvider'

const DEMO_IDS = ['usr-01', 'usr-02', 'usr-05', 'usr-09']

/** Entry points into the sample workspace, one per role so permissions can be explored. */
export default function DemoAccounts({ onSignedIn }: { onSignedIn: () => void }) {
  const { signInDemo } = useAuth()
  const [pending, setPending] = useState<string | null>(null)
  const accounts = DEMO_IDS.map((id) => mockUsers.find((u) => u.id === id)).filter((u): u is (typeof mockUsers)[number] => Boolean(u))

  return (
    <section aria-labelledby="demo-heading" className="border-line/80 bg-surface shadow-card rounded-2xl border p-4">
      <h2 id="demo-heading" className="flex items-center gap-2 text-sm font-semibold">
        <FlaskConical size={15} className="text-brand-600" aria-hidden /> Explore the demo workspace
      </h2>
      <p className="text-muted mt-1 text-xs">Fictional sample data, stored only in this browser. Pick a role to see what it can do.</p>
      <ul className="mt-3 space-y-1.5">
        {accounts.map((u) => (
          <li key={u.id}>
            <button
              type="button"
              disabled={pending !== null}
              onClick={async () => {
                setPending(u.id)
                await signInDemo(u.id)
                onSignedIn()
              }}
              className="border-line hover:border-brand-200 hover:bg-brand-50 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60"
            >
              <Avatar name={u.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{u.name}</span>
                <span className="text-muted block truncate text-xs">{u.role}</span>
              </span>
              {pending === u.id ? (
                <Loader2 size={16} className="text-brand-600 animate-spin" aria-hidden />
              ) : (
                <ArrowRight size={16} className="text-faint" aria-hidden />
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
