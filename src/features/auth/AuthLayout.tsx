import type { ReactNode } from 'react'
import { CalendarCheck2, Columns3, ShieldCheck, Sparkles } from 'lucide-react'
import BrandMark from '@/components/layout/BrandMark'

const HIGHLIGHTS = [
  { icon: Columns3, text: 'Per-vacancy pipelines with full stage history' },
  { icon: CalendarCheck2, text: 'Interview scheduling and structured scorecards' },
  { icon: Sparkles, text: 'Explainable, human-reviewed AI assistance' },
  { icon: ShieldCheck, text: 'Organization-level data isolation' },
]

/** Two-column frame shared by all authentication screens. */
export default function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="bg-canvas grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="from-brand-900 via-brand-700 to-brand-500 relative hidden overflow-hidden bg-linear-to-br p-10 text-white lg:flex lg:flex-col">
        <span className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full border-[40px] border-white/[0.06]" aria-hidden />
        <div className="self-start rounded-xl bg-white/95 px-3 py-2">
          <BrandMark />
        </div>
        <div className="mt-auto max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight">Hire with clarity, not guesswork.</h2>
          <p className="text-brand-100 mt-3 text-sm">
            TalentNest brings requisitions, candidates, interviews, offers and onboarding into one accountable workflow.
          </p>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10">
                  <Icon size={16} aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <BrandMark />
          </div>
          <h1 className="text-ink text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="text-muted mt-1 text-sm">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </main>
    </div>
  )
}
