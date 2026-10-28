import Avatar from '@/components/ui/Avatar'
import { formatDate, greeting } from '@/utils/formatDate'

/**
 * Personal greeting at the top of the dashboard. A single brand-coloured surface
 * gives the page a clear focal point without decorating every card.
 */
export default function WelcomeBanner({ user, summary, children }) {
  const firstName = user.name.split(' ')[0]
  return (
    <section className="relative overflow-hidden rounded-2xl bg-linear-to-br from-brand-800 via-brand-700 to-brand-500 px-5 py-6 text-white shadow-card sm:px-7 sm:py-7" aria-label="Welcome">
      {/* Soft decorative rings */}
      <span className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full border-[28px] border-white/[0.06]" aria-hidden />
      <span className="pointer-events-none absolute -right-6 -bottom-28 h-56 w-56 rounded-full bg-white/[0.05]" aria-hidden />

      <div className="relative flex flex-col gap-5 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Avatar name={user.name} size="lg" className="bg-none! bg-white/15! text-white ring-2 ring-white/25" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-brand-100">{formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">
              {greeting()}, {firstName}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-brand-100">{summary}</p>
          </div>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </section>
  )
}
