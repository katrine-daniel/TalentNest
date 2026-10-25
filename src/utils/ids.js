let counter = 0

/** Generates a client-side id for demo records. A real backend would issue ids. */
export function createId(prefix = 'id') {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/** Human-friendly candidate reference, e.g. CND-1049. */
export function nextCandidateRef(candidates) {
  const max = candidates.reduce((acc, c) => {
    const n = Number(String(c.ref || '').replace('CND-', ''))
    return Number.isFinite(n) && n > acc ? n : acc
  }, 1000)
  return `CND-${max + 1}`
}
