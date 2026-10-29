export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <rect width="32" height="32" rx="8" fill="#4338CA" />
      <circle cx="12" cy="12" r="4" fill="#EDE9FE" />
      <circle cx="21" cy="12" r="3" fill="#EDE9FE" opacity=".7" />
      <path d="M5.5 25c.8-4.2 3.3-6.5 6.5-6.5s5.7 2.3 6.5 6.5" stroke="#EDE9FE" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path d="M19.5 18.6c2.9 0 5 2 5.8 5.6" stroke="#EDE9FE" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".7" />
    </svg>
  )
}
