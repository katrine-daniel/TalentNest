/**
 * AI hiring assistant service — SIMULATED.
 *
 * Every function here builds its response locally from the demo data using
 * deterministic rules and templates. No language model is called. To connect a
 * real model, route these functions through a backend proxy (env.aiProxyUrl)
 * that holds the provider key; never call an AI provider directly from the browser.
 *
 * The assistant is advisory: it never rejects candidates or changes stages.
 */
import { dataStore } from '@/services/storage/dataStore'
import { delay, ServiceError } from '@/services/api/apiClient'
import { getFunnel, getAttentionItems, getAssessmentPassRates, getTimeToHire, getSourceEffectiveness } from '@/features/analytics/analyticsService'
import { formatDateTime, formatDate } from '@/utils/formatDate'
import { getAIProvider, buildPayload } from './aiProvider'

const aiProvider = getAIProvider()

export const AI_MODE =
  aiProvider.mode === 'proxy' ? { live: true, label: 'AI responses via your configured proxy' } : { live: false, label: 'Simulated responses' }

const latency = () => delay(700 + Math.random() * 600)

const lower = (s) => s.toLowerCase()

const RELATED_SKILLS = [
  ['Amadeus', 'Sabre', 'Galileo', 'GDS Integrations'],
  ['React', 'JavaScript', 'TypeScript'],
  ['Node.js', 'Microservices', 'REST APIs'],
  ['English Fluency', 'Customer Handling', 'Email Support', 'Chat Support'],
  ['Revenue Management', 'Rate Parity', 'Distribution Channels'],
  ['Premium Cabin Fares', 'Fare Construction', 'Fare Rules', 'Re-issues'],
  ['Opera PMS', 'Channel Managers', 'Rate Codes'],
  ['Team Management', 'Coaching', 'Quality Audits'],
]

function getCandidate(candidateId) {
  const c = dataStore.read('candidates').find((x) => x.id === candidateId)
  if (!c) throw new ServiceError('Select a candidate in the context panel first.', 'missing-context')
  return c
}

function getJob(jobId) {
  const j = dataStore.read('jobs').find((x) => x.id === jobId)
  if (!j) throw new ServiceError('Select a vacancy in the context panel first.', 'missing-context')
  return j
}

const fullName = (c) => `${c.firstName} ${c.lastName}`

// --- Resume extraction -------------------------------------------------------
export async function extractResume({ candidateId }) {
  await latency()
  const c = getCandidate(candidateId)
  const source = c.resume ? `${c.resume.fileName} (uploaded ${formatDate(c.resume.uploadedAt)})` : 'Candidate profile fields (no resume on file)'
  return {
    kind: 'resume',
    title: `Resume extraction — ${fullName(c)}`,
    data: {
      name: fullName(c),
      email: c.email,
      phone: c.phone,
      location: c.location,
      currentRole: `${c.currentTitle}${c.currentCompany && c.currentCompany !== '—' ? ` at ${c.currentCompany}` : ''}`,
      experienceYears: c.experienceYears,
      noticePeriod: c.noticePeriod,
      skills: c.skills,
      languages: c.languages,
      experience: c.experience,
      education: c.education,
      highlights: c.experience
        .map((e) => e.summary)
        .filter(Boolean)
        .slice(0, 3),
    },
    sources: [{ label: source, detail: 'Fields: contact, roles, dates, skills, education, languages' }],
    caveat: c.resume ? null : 'No resume file is attached, so this summary reflects only what was entered on the profile.',
  }
}

// --- Skill matching ----------------------------------------------------------
export async function matchSkills({ candidateId, jobId }) {
  await latency()
  const c = getCandidate(candidateId)
  const j = getJob(jobId)
  const have = new Set(c.skills.map(lower))
  // provenance: 'verified' = stated in the candidate's resume/profile; 'inferred' = deduced from a related skill.
  const rows = j.skills.map((skill) => {
    if (have.has(lower(skill))) {
      const exp = c.experience.find((e) => lower(e.summary + e.title).includes(lower(skill).split(' ')[0]))
      return {
        skill,
        level: 'match',
        provenance: 'verified',
        evidence: exp ? `Listed in skills; also referenced in role at ${exp.company}` : 'Listed in candidate skills',
      }
    }
    const group = RELATED_SKILLS.find((g) => g.some((s) => lower(s) === lower(skill)))
    const related = group?.find((s) => have.has(lower(s)))
    if (related) return { skill, level: 'partial', provenance: 'inferred', evidence: `Inferred from related skill “${related}” — confirm in interview` }
    return { skill, level: 'missing', provenance: 'verified', evidence: 'Not found in resume or profile' }
  })
  const matched = rows.filter((r) => r.level === 'match').length
  const partial = rows.filter((r) => r.level === 'partial').length
  const score = Math.round(((matched + partial * 0.5) / j.skills.length) * 100)
  const expFit = c.experienceYears < j.experienceMin ? 'below' : c.experienceYears > j.experienceMax ? 'above' : 'within'
  return {
    kind: 'skillMatch',
    title: `Skill match — ${fullName(c)} × ${j.title}`,
    data: {
      score,
      rows,
      experience: { years: c.experienceYears, min: j.experienceMin, max: j.experienceMax, fit: expFit },
      extraSkills: c.skills.filter((s) => !j.skills.map(lower).includes(lower(s))),
    },
    sources: [
      { label: `Vacancy requirements — ${j.title}`, detail: `${j.skills.length} required skills, ${j.experienceMin}–${j.experienceMax} yrs` },
      { label: c.resume?.fileName ?? 'Candidate profile', detail: `${c.skills.length} skills, ${c.experience.length} roles` },
    ],
    caveat:
      'Keyword-based indicator to guide review, computed only from job-related fields (skills, roles, years of experience). Name, gender, age, photo, nationality and similar characteristics are never used. It is not a hiring decision.',
  }
}

// --- Candidate summary ---------------------------------------------------------
export async function summarizeCandidate({ candidateId, jobId }) {
  await latency()
  const c = getCandidate(candidateId)
  const j = jobId ? dataStore.read('jobs').find((x) => x.id === jobId) : null
  const apps = dataStore.read('applications').filter((a) => a.candidateId === candidateId)
  const jobs = dataStore.read('jobs')
  const verified = [
    `${c.experienceYears} years of experience; currently ${c.currentTitle}${c.currentCompany !== '—' ? ` at ${c.currentCompany}` : ''}.`,
    c.skills.length ? `Lists ${c.skills.length} skills: ${c.skills.slice(0, 6).join(', ')}${c.skills.length > 6 ? '…' : ''}.` : 'No skills recorded.',
    c.education[0] ? `Education: ${[c.education[0].degree, c.education[0].institution].filter(Boolean).join(', ')}.` : 'No education recorded.',
    `Notice period: ${c.noticePeriod}.`,
    `${apps.length} application(s): ${
      apps
        .map((a) => jobs.find((x) => x.id === a.jobId)?.title)
        .filter(Boolean)
        .join('; ') || 'none'
    }.`,
  ]
  const inferred = []
  const roles = new Set(c.experience.map((e) => e.company))
  if (roles.size >= 3) inferred.push(`Has worked at ${roles.size} organisations — may bring broad process exposure (confirm motivations for moves).`)
  if (c.experience.some((e) => /\d/.test(e.summary))) inferred.push('Resume includes quantified achievements, which suggests results-oriented experience.')
  if (j) {
    const overlap = j.skills.filter((s) => c.skills.some((cs) => lower(cs) === lower(s)))
    inferred.push(`${overlap.length} of ${j.skills.length} required skills for ${j.title} appear on the profile.`)
  }
  return {
    kind: 'summary',
    title: `Candidate summary — ${fullName(c)}`,
    data: { verified, inferred },
    sources: [{ label: c.resume?.fileName ?? 'Candidate profile', detail: 'Profile fields and application records' }],
    caveat: 'Verified points restate recorded data. Inferred points are interpretations to check with the candidate.',
    editable: false,
  }
}

// --- Resume improvement suggestions ----------------------------------------------
export async function resumeSuggestions({ candidateId, jobId }) {
  await latency()
  const c = getCandidate(candidateId)
  const j = getJob(jobId)
  const missing = j.skills.filter((s) => !c.skills.some((cs) => lower(cs) === lower(s)))
  const suggestions = []
  if (missing.length)
    suggestions.push({
      title: 'Address required skills',
      detail: `If the candidate has experience with ${missing.join(', ')}, it is not stated. Ask them to add concrete examples.`,
      basis: 'Vacancy requirements vs. listed skills',
    })
  const vague = c.experience.filter((e) => e.summary && !/\d/.test(e.summary))
  if (vague.length)
    suggestions.push({
      title: 'Quantify achievements',
      detail: `${vague.length} role description(s) have no measurable outcomes (volumes, percentages, targets).`,
      basis: 'Experience summaries',
    })
  const empty = c.experience.filter((e) => !e.summary)
  if (empty.length)
    suggestions.push({ title: 'Describe responsibilities', detail: `${empty.length} role(s) have no description at all.`, basis: 'Experience entries' })
  if (!c.resume)
    suggestions.push({ title: 'Upload a resume', detail: 'No resume file is attached; the profile was entered manually.', basis: 'Candidate record' })
  if (c.skills.length < 4)
    suggestions.push({ title: 'List more skills', detail: 'Fewer than four skills are listed, which makes matching unreliable.', basis: 'Skills list' })
  return {
    kind: 'suggestions',
    title: `Resume suggestions — ${fullName(c)} for ${j.title}`,
    data: {
      items: suggestions.length
        ? suggestions
        : [{ title: 'No gaps detected', detail: 'The profile covers the vacancy requirements we can check automatically.', basis: 'Vacancy requirements' }],
    },
    sources: [
      { label: `Vacancy: ${j.title}`, detail: `${j.skills.length} required skills` },
      { label: c.resume?.fileName ?? 'Candidate profile', detail: `${c.experience.length} roles` },
    ],
    caveat: 'Suggestions are for coaching the candidate or clarifying in interview — not for screening them out.',
  }
}

// --- Job description review --------------------------------------------------------
const EXCLUSIONARY = [
  { term: /\b(rock ?star|ninja|guru)\b/i, suggestion: 'Use the actual role title; jargon can discourage qualified applicants.' },
  { term: /\b(young|energetic|digital native)\b/i, suggestion: 'Avoid age-coded language; describe the work instead.' },
  { term: /\bnative (english )?speaker\b/i, suggestion: 'Specify the language proficiency needed (e.g. "fluent English") rather than native status.' },
  { term: /\b(he|his|him)\b/i, suggestion: 'Use gender-neutral language ("they", "you").' },
  { term: /\bmust have \d+\+? years\b/i, suggestion: 'Consider describing competencies instead of strict year counts.' },
]

export async function reviewJobDescription({ jobId }) {
  await latency()
  const j = getJob(jobId)
  const findings = []
  const words = j.description.trim().split(/\s+/).length
  if (words < 60)
    findings.push({
      title: 'Add more detail',
      detail: `The description has ${words} words. Include day-to-day responsibilities, team context and how success is measured.`,
      basis: 'Description length',
    })
  const unmentioned = j.skills.filter((s) => !lower(j.description).includes(lower(s).split(' ')[0]))
  if (unmentioned.length)
    findings.push({
      title: 'Explain required skills',
      detail: `These required skills are not discussed in the description: ${unmentioned.join(', ')}.`,
      basis: 'Skills vs. description',
    })
  if (!j.salaryMin || !j.salaryMax)
    findings.push({ title: 'State the salary range', detail: 'Published ranges improve applicant quality and pay transparency.', basis: 'Salary fields' })
  EXCLUSIONARY.forEach(({ term, suggestion }) => {
    const m = j.description.match(term)
    if (m) findings.push({ title: `Reconsider “${m[0]}”`, detail: suggestion, basis: 'Inclusive-language check' })
  })
  if (!/\b(hybrid|remote|on-site|office)\b/i.test(j.description))
    findings.push({ title: 'Mention the work arrangement', detail: `The posting is ${j.workMode}; say so in the description.`, basis: 'Work mode field' })
  return {
    kind: 'suggestions',
    title: `Job description review — ${j.title}`,
    data: { items: findings.length ? findings : [{ title: 'Looks good', detail: 'No issues found by the automated checks.', basis: 'All checks' }] },
    sources: [{ label: `Vacancy: ${j.title}`, detail: `${words} words, ${j.skills.length} required skills` }],
    caveat: 'Rule-based checks. A person should review tone and accuracy before publishing.',
  }
}

// --- Question generation -----------------------------------------------------
const INTERVIEW_BANK = {
  'dep-eng': [
    [
      'Walk me through how you would structure state for a multi-step flight booking form.',
      'Frontend architecture',
      'Separates server and UI state; mentions validation and persistence between steps.',
    ],
    [
      'A fare search API is slow at peak. How do you investigate and fix it?',
      'Performance',
      'Measures first; caching strategy; mentions timeouts from GDS providers.',
    ],
    ['Describe a production incident you owned end-to-end.', 'Ownership', 'Clear timeline, root cause, follow-up actions, blameless tone.'],
    [
      'How do you keep a shared component library consistent across teams?',
      'Collaboration',
      'Versioning, documentation, review process, accessibility checks.',
    ],
    ['How would you test a payment confirmation page?', 'Quality', 'Unit + integration + E2E split; handles failure states and retries.'],
  ],
  'dep-cc': [
    [
      'A US caller is angry because their flight was cancelled and they missed a connection. Walk me through the call.',
      'De-escalation',
      'Acknowledges emotion, takes ownership, offers concrete options, confirms next steps.',
    ],
    [
      'How do you keep your average handle time low without rushing the customer?',
      'Efficiency',
      'Uses knowledge base, structured probing, avoids unnecessary holds.',
    ],
    ['Tell me about a time you turned an unhappy customer into a satisfied one.', 'Customer empathy', 'Specific situation, measurable outcome.'],
    ['How do you stay alert and consistent during night shifts?', 'Shift readiness', 'Realistic routine; understands rotational shifts.'],
    [
      'A customer asks for a refund that policy does not allow. What do you say?',
      'Policy adherence',
      'Explains policy clearly, offers alternatives, escalates appropriately.',
    ],
  ],
  'dep-travel': [
    [
      'Plan a 10-day Europe itinerary for a family of four with a ₹6L budget. What do you ask first?',
      'Needs discovery',
      'Asks dates, visa status, preferences, flexibility before proposing.',
    ],
    ['Explain the difference between a re-issue and a revalidation.', 'Fare knowledge', 'Accurate definitions and when each applies.'],
    [
      'A corporate traveller wants a fare outside policy. How do you handle it?',
      'Policy & tact',
      'Checks policy, offers compliant alternatives, routes approvals.',
    ],
    ['How do you upsell travel insurance without sounding pushy?', 'Sales', 'Value-led framing tied to the traveller’s itinerary.'],
    ['Which GDS commands do you use most often for availability and pricing?', 'GDS proficiency', 'Correct commands for Amadeus or Sabre.'],
  ],
  'dep-bcf': [
    [
      'A client wants business class to New York with a stopover in London. How do you build the fare?',
      'Fare construction',
      'Considers stopover rules, fare basis, routing restrictions.',
    ],
    ['How do you handle an HNI client who changes plans three times in a day?', 'Client handling', 'Patience, proactive options, clear cost communication.'],
    ['When would you recommend an award booking over a paid premium fare?', 'Premium expertise', 'Understands award availability, surcharges and value.'],
    ['Explain fare rules that commonly cause re-issue penalties in premium cabins.', 'Fare rules', 'Change fees, fare differences, validity.'],
  ],
  'dep-hotel': [
    [
      'A group of 40 needs rooms during a peak weekend and the hotel is nearly full. What do you do?',
      'Group bookings',
      'Checks allotments, alternatives, negotiates release dates.',
    ],
    ['How do you prevent overbookings across channel managers?', 'Inventory control', 'Understands sync delays, stop-sells, manual checks.'],
    ['Describe how you handle a guest complaint about a rate mismatch.', 'Guest communication', 'Investigates rate codes, owns resolution.'],
  ],
  'dep-ofr': [
    [
      'Our rate on one OTA is 8% lower than direct. How do you investigate?',
      'Rate parity',
      'Checks mapping, promotions, currency, cached rates; documents evidence.',
    ],
    ['How would you model the impact of a 5% rate increase on occupancy?', 'Analysis', 'Uses historical elasticity, segments, and presents ranges.'],
    ['Write a SQL query outline to find parity breaches by channel per week.', 'SQL', 'Correct grouping and date handling.'],
  ],
}

const HR_QUESTIONS = [
  ['What made you apply to Skyline Voyages, and what are you hoping to grow into here?', 'Motivation', 'Specific to the role and company, not generic.'],
  ['Tell me about a time you disagreed with a manager. What happened?', 'Culture alignment', 'Respectful disagreement, outcome-focused.'],
  ['What are your expectations on compensation and joining date?', 'Compensation fit', 'Clear, realistic, consistent with application.'],
]

export async function generateInterviewQuestions({ jobId, stageName }) {
  await latency()
  const j = getJob(jobId)
  const isHr = lower(stageName ?? '').includes('hr')
  const bank = isHr ? HR_QUESTIONS : (INTERVIEW_BANK[j.departmentId] ?? INTERVIEW_BANK['dep-travel'])
  return {
    kind: 'questions',
    title: `Interview questions — ${stageName || 'Interview'} · ${j.title}`,
    data: {
      items: bank.map(([question, focus, lookFor], i) => ({ id: `q${i}`, question, focus, lookFor })),
    },
    sources: [
      { label: `Vacancy: ${j.title}`, detail: `Skills: ${j.skills.join(', ')}` },
      { label: 'TalentNest question library (demo)', detail: isHr ? 'HR round set' : 'Department set' },
    ],
    editable: true,
  }
}

const ASSESSMENT_BANK = {
  'dep-eng': [
    'Implement a debounced search input in React that queries /api/airports.',
    'Given a list of fares, write a function that returns the cheapest per route.',
    'Explain how you would make a booking page accessible to keyboard users.',
  ],
  'dep-cc': [
    'Listen to the recorded call and write a two-line summary for the CRM.',
    'Choose the most empathetic response to: "I have been on hold for 40 minutes!"',
    'Write a short email apologising for a delayed refund and giving the next update date.',
  ],
  'dep-travel': [
    'What is the minimum connection time and why does it matter for international itineraries?',
    'Identify the fare basis restrictions in the given fare rule extract.',
    'Which documents does an Indian passport holder need for a Schengen tourist visa?',
  ],
  'dep-bcf': [
    'Calculate the fare difference for re-issuing a J-class ticket to a later date.',
    'Which carriers allow stopovers on business-class fares between DEL and JFK via LHR?',
  ],
  'dep-hotel': [
    'Create a group block for 20 rooms with a cut-off date in Opera PMS (describe steps).',
    'What happens if a channel manager fails to sync a stop-sell?',
  ],
  'dep-ofr': [
    'Using the attached rate shop data, identify the three largest parity breaches.',
    'Recommend weekend pricing for a 120-room hotel given the occupancy forecast.',
  ],
}

export async function generateAssessmentQuestions({ jobId }) {
  await latency()
  const j = getJob(jobId)
  const bank = ASSESSMENT_BANK[j.departmentId] ?? ASSESSMENT_BANK['dep-travel']
  return {
    kind: 'questions',
    title: `Assessment questions — ${j.title}`,
    data: { items: bank.map((question, i) => ({ id: `a${i}`, question, focus: j.skills[i % j.skills.length], lookFor: '' })) },
    sources: [{ label: `Vacancy: ${j.title}`, detail: `Experience ${j.experienceMin}–${j.experienceMax} yrs` }],
    editable: true,
  }
}

// --- Feedback summary ---------------------------------------------------------
export async function summarizeFeedback({ candidateId }) {
  await latency()
  const c = getCandidate(candidateId)
  const users = dataStore.read('users')
  const scorecards = dataStore.read('scorecards')
  const interviews = new Map(
    dataStore
      .read('interviews')
      .filter((i) => i.candidateId === candidateId)
      .map((i) => [i.id, i]),
  )
  // Only submitted scorecards are summarised; drafts stay private to their author.
  const submitted = dataStore.read('interviewFeedback').filter((f) => f.status === 'submitted' && interviews.has(f.interviewId))
  if (!submitted.length) {
    throw new ServiceError(`${fullName(c)} has no submitted interview feedback yet.`, 'no-data')
  }
  const entries = submitted.map((f) => {
    const i = interviews.get(f.interviewId)
    const sc = scorecards.find((s) => s.id === i.scorecardId)
    const values = Object.values(f.ratings).filter((v) => v > 0)
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
    return {
      id: f.id,
      stage: i.stageName,
      interviewer: users.find((u) => u.id === f.interviewerId)?.name ?? 'Interviewer',
      date: f.submittedAt,
      recommendation: f.recommendation,
      average: Math.round(avg * 10) / 10,
      strengths: f.strengths,
      concerns: f.concerns,
      criteria: sc?.criteria.map((cr) => ({ name: cr.name, rating: f.ratings[cr.id], evidence: f.evidence?.[cr.id] ?? '' })) ?? [],
    }
  })
  const positive = entries.filter((e) => ['yes', 'strong-yes'].includes(e.recommendation)).length
  return {
    kind: 'feedbackSummary',
    title: `Feedback summary — ${fullName(c)}`,
    data: {
      overview:
        positive === entries.length
          ? `All ${entries.length} interviewer(s) recommended moving forward.`
          : positive === 0
            ? `None of the ${entries.length} interviewer(s) recommended moving forward.`
            : `${positive} of ${entries.length} interviewers recommended moving forward — views are mixed.`,
      entries,
    },
    sources: entries.map((e) => ({ label: `${e.stage} — ${e.interviewer}`, detail: `Submitted ${formatDate(e.date)}` })),
    caveat: 'Summary of submitted scorecards only. The hiring decision remains with the panel.',
  }
}

// --- Email drafting -----------------------------------------------------------
export const EMAIL_PURPOSES = [
  { value: 'interview-invite', label: 'Interview invitation' },
  { value: 'assessment-invite', label: 'Assessment invitation' },
  { value: 'follow-up', label: 'Application update' },
  { value: 'offer', label: 'Offer cover note' },
  { value: 'rejection', label: 'Not progressing (respectful)' },
]

export async function draftEmail({ candidateId, jobId, purpose = 'interview-invite', senderName = 'Talent Acquisition' }) {
  await latency()
  const c = getCandidate(candidateId)
  const j = getJob(jobId)
  const next = dataStore
    .read('interviews')
    .filter((i) => i.candidateId === candidateId && i.jobId === jobId && i.status === 'scheduled')
    .sort((a, b) => new Date(a.start) - new Date(b.start))[0]

  const templates = {
    'interview-invite': {
      subject: `Interview invitation — ${j.title}`,
      body: `Hi ${c.firstName},\n\nThank you for your interest in the ${j.title} role at Skyline Voyages. We'd like to invite you to the next stage of our process.\n\n${next ? `Stage: ${next.stageName}\nWhen: ${formatDateTime(next.start)} (${next.durationMin} minutes)\nFormat: ${next.mode}\n` : 'Please reply with two or three time slots that work for you over the next few days.\n'}\nPlease let us know if you need any adjustments to make the interview accessible for you.\n\nBest regards,\n${senderName}`,
    },
    'assessment-invite': {
      subject: `Next step: online assessment for ${j.title}`,
      body: `Hi ${c.firstName},\n\nThanks for speaking with us. The next step for the ${j.title} role is a short online assessment. You'll receive a separate link from our assessment platform.\n\nIt takes roughly 45 minutes; please complete it within three days. Find a quiet place with a stable connection.\n\nGood luck!\n${senderName}`,
    },
    'follow-up': {
      subject: `Update on your application — ${j.title}`,
      body: `Hi ${c.firstName},\n\nA quick update: your application for ${j.title} is still under active review. We expect to share next steps within the coming week.\n\nThank you for your patience.\n\n${senderName}`,
    },
    offer: {
      subject: `Your offer from Skyline Voyages — ${j.title}`,
      body: `Hi ${c.firstName},\n\nCongratulations! We're delighted to offer you the position of ${j.title} in our ${j.location} team. Your formal offer letter is attached with compensation and joining details.\n\nPlease review it and reach out with any questions — we're happy to walk you through it on a call.\n\nWarm regards,\n${senderName}`,
    },
    rejection: {
      subject: `Your application for ${j.title}`,
      body: `Hi ${c.firstName},\n\nThank you for the time you invested in applying for the ${j.title} role. After careful consideration, we won't be moving forward with your application at this stage.\n\nThis was not an easy decision. We'd be glad to keep your profile on file for future roles that match your experience.\n\nWith best wishes,\n${senderName}`,
    },
  }
  const draft = templates[purpose] ?? templates['follow-up']
  return {
    kind: 'email',
    title: `Email draft — ${EMAIL_PURPOSES.find((p) => p.value === purpose)?.label ?? 'Update'}`,
    data: { to: c.email, ...draft },
    sources: [
      { label: `Candidate: ${fullName(c)}`, detail: c.email },
      { label: `Vacancy: ${j.title}`, detail: j.location },
      ...(next ? [{ label: 'Scheduled interview', detail: `${next.stageName}, ${formatDateTime(next.start)}` }] : []),
    ],
    editable: true,
    caveat: 'Review and edit before sending. Sending email is not connected in this demo.',
  }
}

// --- Funnel insights ------------------------------------------------------------
export async function funnelInsights() {
  await latency()
  const data = dataStore.getSnapshot().data
  const funnel = getFunnel(data)
  const weakest = [...funnel.slice(1)].filter((f) => f.count > 0 || f.conversion > 0).sort((a, b) => a.conversion - b.conversion)[0]
  const attention = getAttentionItems(data)
  const pass = getAssessmentPassRates(data).sort((a, b) => a.rate - b.rate)[0]
  const tth = getTimeToHire(data)
    .filter((d) => d.days !== null)
    .sort((a, b) => b.days - a.days)[0]
  const sources = getSourceEffectiveness(data).filter((s) => s.applications >= 3 && s.interviewRate !== null)
  const bestSource = [...sources].sort((a, b) => b.interviewRate - a.interviewRate)[0]
  const insights = [
    weakest && {
      headline: `Largest drop-off is at "${weakest.label}" (${weakest.conversion}% conversion from the previous step).`,
      evidence: funnel.map((f) => `${f.label}: ${f.count}`).join(' → '),
      suggestion: 'Review stage criteria and recruiter notes for candidates who stopped here.',
    },
    {
      headline: `${attention.filter((a) => a.kind === 'feedback').length} completed interviews are missing at least one scorecard.`,
      evidence: 'Completed interviews where not every panelist has submitted feedback.',
      suggestion: 'Nudge interviewers — pending feedback is a common cause of pipeline stalls.',
    },
    pass && {
      headline: `${pass.name} has the lowest pass rate (${pass.rate}%).`,
      evidence: `${pass.passed} of ${pass.evaluated} evaluated candidates scored at or above ${pass.passMark}%.`,
      suggestion: 'Check whether the pass mark or screening criteria need calibrating.',
    },
    tth && {
      headline: `${tth.name} has the longest recorded time-to-hire (${tth.days} days).`,
      evidence: `Average over ${tth.hires} hire(s) with both application and hire dates recorded.`,
      suggestion: 'Consider parallel scheduling of interview rounds for this department.',
    },
    bestSource && {
      headline: `${bestSource.source} has the highest interview rate (${bestSource.interviewRate}%).`,
      evidence: `${bestSource.interviewed} of ${bestSource.applications} applications from this source reached an interview.`,
      suggestion: 'Small samples can mislead — treat this as a prompt to investigate, not a conclusion.',
    },
  ].filter(Boolean)
  return {
    kind: 'funnel',
    title: 'Hiring funnel insights',
    data: { insights, funnel },
    sources: [
      { label: 'Pipeline data', detail: `${data.applications.length} applications across ${data.jobs.length} vacancies` },
      { label: 'Interview & assessment records', detail: `${data.interviews.length} interviews, ${data.assessments.length} assessments` },
    ],
  }
}

// --- Free-text routing ------------------------------------------------------------
const LOCAL_TOOLS = [
  { id: 'summary', label: 'Candidate summary', needs: ['candidate'], run: (ctx) => summarizeCandidate(ctx) },
  { id: 'resume', label: 'Extract resume', needs: ['candidate'], run: (ctx) => extractResume(ctx) },
  { id: 'match', label: 'Match resume to job', needs: ['candidate', 'job'], run: (ctx) => matchSkills(ctx) },
  { id: 'resume-tips', label: 'Resume improvement tips', needs: ['candidate', 'job'], run: (ctx) => resumeSuggestions(ctx) },
  { id: 'interview-q', label: 'Interview questions', needs: ['job'], run: (ctx) => generateInterviewQuestions(ctx) },
  { id: 'assessment-q', label: 'Assessment questions', needs: ['job'], run: (ctx) => generateAssessmentQuestions(ctx) },
  { id: 'feedback', label: 'Summarise feedback', needs: ['candidate'], run: (ctx) => summarizeFeedback(ctx) },
  { id: 'jd-review', label: 'Improve job description', needs: ['job'], run: (ctx) => reviewJobDescription(ctx) },
  { id: 'email', label: 'Draft email', needs: ['candidate', 'job'], run: (ctx) => draftEmail(ctx) },
  { id: 'funnel', label: 'Funnel insights', needs: [], run: () => funnelInsights() },
]

/**
 * When an AI proxy is configured, tools run through it (the proxy holds the provider
 * key and returns the same response shapes). Otherwise the local rule-based
 * implementations run and every response is labelled "Simulated".
 */
export const AI_TOOLS = LOCAL_TOOLS.map((tool) => ({
  ...tool,
  run: (ctx) => (aiProvider.mode === 'proxy' ? aiProvider.run(tool.id, buildPayload(tool.id, ctx)) : tool.run(ctx)),
}))

const ROUTES = [
  { test: /summary|overview|tell me about/i, tool: 'summary' },
  { test: /improve (the )?(job|jd|description)|job description/i, tool: 'jd-review' },
  { test: /resume (tips|improve|suggest)|improve (the )?resume/i, tool: 'resume-tips' },
  { test: /resume|cv|extract|parse/i, tool: 'resume' },
  { test: /match|fit|skill gap|skills/i, tool: 'match' },
  { test: /assessment|test question|quiz/i, tool: 'assessment-q' },
  { test: /interview question|questions|ask in/i, tool: 'interview-q' },
  { test: /feedback|scorecard|summar/i, tool: 'feedback' },
  { test: /email|mail|draft|message|invite/i, tool: 'email' },
  { test: /funnel|insight|drop|bottleneck|pipeline health|conversion/i, tool: 'funnel' },
]

export async function ask(message, context) {
  const route = ROUTES.find((r) => r.test.test(message))
  if (!route) {
    await delay(500)
    return {
      kind: 'text',
      title: 'How I can help',
      data: {
        text: 'I can summarise a candidate, extract resume details, match a resume to a vacancy, suggest resume improvements, generate interview or assessment questions, summarise interview feedback, review a job description, draft candidate emails and highlight funnel bottlenecks. Choose a candidate and vacancy on the left, then pick a task or describe it in your own words.',
      },
    }
  }
  return AI_TOOLS.find((t) => t.id === route.tool).run(context)
}
