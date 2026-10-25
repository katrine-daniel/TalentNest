// Helpers for generating deterministic, date-relative demo data.

export function createRng(seed = 42) {
  let t = seed >>> 0
  return function rng() {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = (rng, list) => list[Math.floor(rng() * list.length)]

export function pickMany(rng, list, count) {
  const pool = [...list]
  const out = []
  while (out.length < count && pool.length) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0])
  }
  return out
}

export const intBetween = (rng, min, max) => Math.floor(rng() * (max - min + 1)) + min

/** ISO date `days` from now at a given hour/minute (negative = past). */
export function relativeDate(days, hour = 10, minute = 0) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

/**
 * Moves weekend dates onto a working day so interviews look realistic.
 * Future dates shift forward to Monday; past dates shift back to Friday.
 */
export function workingDay(days, hour, minute) {
  const d = new Date(relativeDate(days, hour, minute))
  const dow = d.getDay()
  if (days < 0) {
    if (dow === 6) d.setDate(d.getDate() - 1)
    if (dow === 0) d.setDate(d.getDate() - 2)
  } else {
    if (dow === 6) d.setDate(d.getDate() + 2)
    if (dow === 0) d.setDate(d.getDate() + 1)
  }
  return d.toISOString()
}
