const norm = (s) => String(s ?? '').toLowerCase()

/** Candidate matches by name, email, reference ID, title or skill. */
export function matchesCandidate(candidate, query) {
  const q = norm(query).trim()
  if (!q) return true
  const haystack = [
    `${candidate.firstName} ${candidate.lastName}`,
    candidate.email,
    candidate.ref,
    candidate.currentTitle,
    candidate.location,
    ...(candidate.skills ?? []),
  ]
  return q.split(/\s+/).every((term) => haystack.some((h) => norm(h).includes(term)))
}

export function matchesJob(job, query) {
  const q = norm(query).trim()
  if (!q) return true
  return [job.title, job.location, job.category, ...(job.skills ?? [])].some((h) => norm(h).includes(q))
}
