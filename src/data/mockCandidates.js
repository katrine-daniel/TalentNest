// Fictional candidates. Profiles are generated deterministically from the
// role tracks below so the demo looks realistic without thousands of hand-written lines.
import { createRng, pick, pickMany, intBetween, relativeDate } from './seedUtils'

const PEOPLE = [
  ['Ananya', 'Sharma', 'Delhi'],
  ['Rahul', 'Verma', 'Gurugram'],
  ['Sneha', 'Pillai', 'Mumbai'],
  ['Karan', 'Malhotra', 'Gurugram'],
  ['Ishita', 'Bose', 'Kolkata'],
  ['Aditya', 'Rao', 'Bengaluru'],
  ['Fatima', 'Sheikh', 'Pune'],
  ['Nikhil', 'Gupta', 'Noida'],
  ['Pooja', 'Kulkarni', 'Pune'],
  ['Siddharth', 'Menon', 'Bengaluru'],
  ['Tanvi', 'Deshpande', 'Mumbai'],
  ['Imran', 'Qureshi', 'Delhi'],
  ['Riya', 'Chatterjee', 'Kolkata'],
  ['Varun', 'Reddy', 'Hyderabad'],
  ['Meghna', 'Saxena', 'Noida'],
  ['Joseph', "D'Souza", 'Goa'],
  ['Lakshmi', 'Narayanan', 'Chennai'],
  ['Harsh', 'Agarwal', 'Jaipur'],
  ['Zoya', 'Khan', 'Mumbai'],
  ['Aman', 'Chauhan', 'Gurugram'],
  ['Divya', 'Krishnan', 'Bengaluru'],
  ['Rohit', 'Bhatia', 'Delhi'],
  ['Neeraj', 'Pandey', 'Lucknow'],
  ['Shreya', 'Ghosh', 'Kolkata'],
  ['Arnav', 'Joshi', 'Pune'],
  ['Kritika', 'Arora', 'Delhi'],
  ['Manish', 'Yadav', 'Gurugram'],
  ['Nandini', 'Iyer', 'Chennai'],
  ['Samuel', 'Mathew', 'Kochi'],
  ['Ayesha', 'Siddiqui', 'Hyderabad'],
  ['Vivek', 'Tiwari', 'Noida'],
  ['Gauri', 'Patil', 'Mumbai'],
  ['Kabir', 'Sethi', 'Delhi'],
  ['Elena', 'Rossi', 'Bengaluru'],
  ['Mohit', 'Jain', 'Jaipur'],
  ['Sanya', 'Kapoor', 'Gurugram'],
  ['Deepak', 'Nair', 'Kochi'],
  ['Ritika', 'Banerjee', 'Kolkata'],
  ['Yash', 'Thakur', 'Pune'],
  ['Maria', 'Fernandes', 'Goa'],
  ['Abhishek', 'Mishra', 'Delhi'],
  ['Preeti', 'Sinha', 'Patna'],
  ['Omar', 'Farooq', 'Mumbai'],
  ['Kavita', 'Reddy', 'Hyderabad'],
  ['Tarun', 'Bajaj', 'Gurugram'],
  ['Simran', 'Gill', 'Chandigarh'],
  ['Arjun', 'Pillai', 'Bengaluru'],
  ['Nisha', 'Rawat', 'Dehradun'],
  ['Chen', 'Wei', 'Bengaluru'],
  ['Prakash', 'Hegde', 'Mangaluru'],
]

const UNIVERSITIES = [
  'University of Delhi',
  'University of Mumbai',
  'Savitribai Phule Pune University',
  'Christ University',
  'Amity University',
  'Anna University',
  'Jadavpur University',
  'Osmania University',
  'IHM Mumbai',
  'Manipal Academy of Higher Education',
  'VIT Vellore',
  'Symbiosis International University',
]

const TRACKS = {
  'dep-eng': {
    titles: ['Software Engineer', 'Frontend Developer', 'Full Stack Developer', 'Backend Developer', 'SDE II'],
    companies: ['Razorpay', 'Freshworks', 'Infosys', 'Swiggy', 'MakeMyTrip', 'ThoughtWorks', 'Zoho'],
    skills: [
      'React',
      'JavaScript',
      'TypeScript',
      'Node.js',
      'PostgreSQL',
      'AWS',
      'Tailwind CSS',
      'REST APIs',
      'Docker',
      'GraphQL',
      'Redis',
      'Jest',
      'Playwright',
      'Microservices',
    ],
    degrees: ['B.Tech, Computer Science', 'B.E., Information Technology', 'MCA'],
    summaries: [
      'Shipped customer-facing features used by over a million monthly users.',
      'Led migration of a legacy module to a modern component architecture.',
      'Improved API latency by optimising queries and adding caching layers.',
    ],
  },
  'dep-cc': {
    titles: ['Customer Service Executive', 'Voice Process Associate', 'Customer Support Specialist', 'Senior Associate — Voice'],
    companies: ['Teleperformance', 'Concentrix', 'Genpact', 'Tech Mahindra BPS', 'Startek', 'iEnergizer'],
    skills: [
      'English Fluency',
      'Hindi',
      'Customer Handling',
      'CRM Tools',
      'Night Shifts',
      'Problem Solving',
      'Email Support',
      'Chat Support',
      'Escalation Handling',
      'Typing 35+ WPM',
      'De-escalation',
    ],
    degrees: ['B.Com', 'B.A., English', 'BBA', 'Higher Secondary (12th)'],
    summaries: [
      'Consistently met AHT targets while maintaining CSAT above 90%.',
      'Handled inbound queries for a US telecom client across rotational shifts.',
      'Recognised as top performer for first-call resolution two quarters in a row.',
    ],
  },
  'dep-travel': {
    titles: ['Travel Consultant', 'Reservations Agent', 'Holiday Planner', 'Corporate Travel Executive'],
    companies: ['Thomas Cook', 'SOTC', 'Yatra', 'Cleartrip', 'FCM Travel', 'Cox & Kings'],
    skills: ['Amadeus', 'Sabre', 'Itinerary Planning', 'Fare Rules', 'Visa Guidance', 'Upselling', 'Corporate Travel Policy', 'MICE', 'Account Management'],
    degrees: ['BBA, Travel & Tourism', 'Diploma in Travel & Tourism', 'B.A., Tourism Studies'],
    summaries: [
      'Built multi-country leisure itineraries with an average booking value of ₹2.4L.',
      'Managed travel desk for three corporate accounts with policy compliance above 95%.',
      'Handled re-issues and refunds across Amadeus and Sabre.',
    ],
  },
  'dep-hotel': {
    titles: ['Reservations Executive', 'Front Office Associate', 'Guest Relations Executive'],
    companies: ['Taj Hotels', 'ITC Hotels', 'Marriott International', 'Lemon Tree', 'OYO'],
    skills: ['Opera PMS', 'Channel Managers', 'Group Bookings', 'Guest Communication', 'Rate Codes', 'Upselling'],
    degrees: ['B.Sc. Hospitality & Hotel Administration', 'Diploma in Hotel Management'],
    summaries: ['Managed group blocks and amendments for a 220-room resort.', 'Reduced reservation errors by introducing a double-check workflow.'],
  },
  'dep-ofr': {
    titles: ['Revenue Analyst', 'Distribution Executive', 'Pricing Analyst'],
    companies: ['RateGain', 'OYO', 'Expedia Group', 'Agoda', 'IDeaS'],
    skills: ['Revenue Management', 'Rate Parity', 'Excel Modelling', 'SQL', 'Distribution Channels', 'Power BI', 'Python'],
    degrees: ['MBA, Finance', 'B.Sc. Statistics', 'B.Com (Hons)'],
    summaries: ['Built a parity monitoring dashboard covering 400 partner hotels.', 'Recommended pricing changes that lifted RevPAR by 6% in shoulder season.'],
  },
  'dep-bcf': {
    titles: ['Premium Travel Consultant', 'Ticketing Executive', 'Fares Specialist'],
    companies: ['Emirates', 'Air India', 'Riya Travel', 'BCD Travel', 'Akbar Travels'],
    skills: ['Premium Cabin Fares', 'Amadeus', 'Award Bookings', 'HNI Client Handling', 'Re-issues', 'Fare Construction', 'Galileo'],
    degrees: ['BBA, Aviation Management', 'Diploma in Airline & Travel Management', 'B.A.'],
    summaries: ['Managed premium-cabin bookings for 60+ HNI clients.', 'Constructed complex multi-city fares with stopover optimisation.'],
  },
}

const SOURCES = ['LinkedIn', 'Naukri', 'Referral', 'Careers page', 'Indeed', 'Walk-in drive', 'Campus']
const NOTICE = ['Immediate', '15 days', '30 days', '60 days', '90 days']
const LANGUAGES = ['English', 'Hindi', 'Marathi', 'Tamil', 'Bengali', 'Kannada', 'Malayalam', 'Telugu', 'Punjabi', 'French']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const NOTE_TEXTS = [
  'Strong communication on the screening call. Open to rotational shifts.',
  'Salary expectation slightly above band — flagged to hiring manager.',
  'Has an offer in hand from a competitor; move quickly if shortlisted.',
  'Prefers hybrid; can relocate within 30 days.',
  'Referred by an existing team member — referral bonus eligible.',
]

/**
 * Builds candidate profiles. `primaryJobs` assigns each person to a job so their
 * background matches the role they applied for.
 */
export function buildCandidates(primaryJobs, recruiterFor) {
  const rng = createRng(7)
  const now = new Date()

  return PEOPLE.map(([firstName, lastName, location], i) => {
    const job = primaryJobs[i]
    const track = TRACKS[job.departmentId]
    const years = Math.max(0, intBetween(rng, job.experienceMin, job.experienceMax + 1))
    const jobsHeld = Math.min(3, Math.max(1, Math.ceil(years / 2.5)))
    const skillPool = Array.from(new Set([...job.skills, ...track.skills]))
    const skills = pickMany(rng, skillPool, intBetween(rng, 4, 7))

    let cursorYear = now.getFullYear()
    let cursorMonth = now.getMonth()
    const experience = Array.from({ length: years === 0 ? 0 : jobsHeld }, (_, j) => {
      const span = Math.max(1, Math.round((years * 12) / jobsHeld))
      const endLabel = j === 0 ? 'Present' : `${MONTHS[cursorMonth]} ${cursorYear}`
      const startTotal = cursorYear * 12 + cursorMonth - span
      cursorYear = Math.floor(startTotal / 12)
      cursorMonth = ((startTotal % 12) + 12) % 12
      return {
        id: `exp-${i}-${j}`,
        title: j === 0 ? pick(rng, track.titles) : pick(rng, track.titles.slice(0, 2)),
        company: pick(rng, track.companies),
        start: `${MONTHS[cursorMonth]} ${cursorYear}`,
        end: endLabel,
        summary: pick(rng, track.summaries),
      }
    })

    const gradYear = now.getFullYear() - years - intBetween(rng, 0, 1)
    const id = `cand-${1001 + i}`

    return {
      id,
      ref: `CND-${1001 + i}`,
      firstName,
      lastName,
      email: `${firstName}.${lastName}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com',
      phone: `+91 9${intBetween(rng, 100, 999)} ${intBetween(rng, 100, 999)} ${intBetween(rng, 100, 999)}`,
      location,
      currentTitle: experience[0]?.title ?? 'Fresh graduate',
      currentCompany: experience[0]?.company ?? '—',
      experienceYears: years,
      noticePeriod: years === 0 ? 'Immediate' : pick(rng, NOTICE),
      expectedSalary: Math.round((job.salaryMin + rng() * (job.salaryMax - job.salaryMin)) / 10000) * 10000,
      source: pick(rng, SOURCES),
      recruiterId: recruiterFor(job),
      skills,
      languages: Array.from(new Set(['English', ...pickMany(rng, LANGUAGES, 2)])),
      experience,
      education: [
        {
          id: `edu-${i}`,
          degree: pick(rng, track.degrees),
          institution: pick(rng, UNIVERSITIES),
          year: String(gradYear),
        },
      ],
      notes: rng() > 0.55 ? [{ id: `note-${i}`, authorId: recruiterFor(job), text: pick(rng, NOTE_TEXTS), at: relativeDate(-intBetween(rng, 1, 10), 15) }] : [],
      resume:
        rng() > 0.12
          ? {
              fileName: `${firstName}_${lastName}_Resume.pdf`.replace(/'/g, ''),
              size: intBetween(rng, 90, 480) * 1024,
              uploadedAt: relativeDate(-intBetween(rng, 5, 40)),
            }
          : null,
      createdAt: relativeDate(-intBetween(rng, 3, 60)),
    }
  })
}

export const CANDIDATE_COUNT = PEOPLE.length
export const CANDIDATE_SOURCES = SOURCES
export const NOTICE_PERIODS = NOTICE
