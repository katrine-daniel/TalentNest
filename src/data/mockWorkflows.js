// Recruitment workflow templates. Each vacancy copies a template's stages so
// departments can run different processes and individual jobs can be customised.

const stage = (key, name, type) => ({ key, name, type })

export const mockWorkflowTemplates = [
  {
    id: 'wf-dev',
    name: 'Software Engineering',
    description: 'Coding assessment followed by technical and HR interviews.',
    stages: [
      stage('new', 'New Application', 'application'),
      stage('screen', 'Screening', 'screening'),
      stage('assess', 'Coding Assessment', 'assessment'),
      stage('tech', 'Technical Interview', 'interview'),
      stage('hr', 'HR Interview', 'interview'),
      stage('decision', 'Final Decision', 'decision'),
      stage('offer', 'Offer', 'offer'),
      stage('hired', 'Hired', 'hired'),
    ],
  },
  {
    id: 'wf-cc',
    name: 'Call Center Executive',
    description: 'Communication assessment, team lead round and HR interview.',
    stages: [
      stage('new', 'New Application', 'application'),
      stage('screen', 'Screening', 'screening'),
      stage('assess', 'Communication Assessment', 'assessment'),
      stage('lead', 'Team Lead Interview', 'interview'),
      stage('hr', 'HR Interview', 'interview'),
      stage('decision', 'Final Decision', 'decision'),
      stage('offer', 'Offer', 'offer'),
      stage('hired', 'Hired', 'hired'),
    ],
  },
  {
    id: 'wf-travel',
    name: 'Travel Consultant',
    description: 'Travel knowledge test, operations interview and HR interview.',
    stages: [
      stage('new', 'New Application', 'application'),
      stage('screen', 'Screening', 'screening'),
      stage('assess', 'Travel Knowledge Assessment', 'assessment'),
      stage('ops', 'Operations Interview', 'interview'),
      stage('hr', 'HR Interview', 'interview'),
      stage('decision', 'Final Decision', 'decision'),
      stage('offer', 'Offer', 'offer'),
      stage('hired', 'Hired', 'hired'),
    ],
  },
  {
    id: 'wf-hotel',
    name: 'Hotel Reservations',
    description: 'GDS & reservations test, operations round and HR interview.',
    stages: [
      stage('new', 'New Application', 'application'),
      stage('screen', 'Screening', 'screening'),
      stage('assess', 'GDS & Reservations Test', 'assessment'),
      stage('ops', 'Operations Interview', 'interview'),
      stage('hr', 'HR Interview', 'interview'),
      stage('offer', 'Offer', 'offer'),
      stage('hired', 'Hired', 'hired'),
    ],
  },
  {
    id: 'wf-ofr',
    name: 'Revenue & Distribution',
    description: 'Rate analysis case study, manager interview and HR interview.',
    stages: [
      stage('new', 'New Application', 'application'),
      stage('screen', 'Screening', 'screening'),
      stage('assess', 'Rate Analysis Case Study', 'assessment'),
      stage('mgr', 'Manager Interview', 'interview'),
      stage('hr', 'HR Interview', 'interview'),
      stage('decision', 'Final Decision', 'decision'),
      stage('offer', 'Offer', 'offer'),
      stage('hired', 'Hired', 'hired'),
    ],
  },
]

/** Copies template stages onto a job with job-scoped ids. */
export function stagesFromTemplate(template, jobId) {
  return template.stages.map((s) => ({ id: `${jobId}-${s.key}`, name: s.name, type: s.type }))
}
