// Fictional organisation used for demonstration only.

export const COMPANY = {
  name: 'Skyline Voyages Group',
  product: 'TalentNest',
}

export const mockDepartments = [
  { id: 'dep-cc', name: 'Call Center Services', code: 'CCS', headId: 'usr-06', color: '#592ca2' },
  { id: 'dep-travel', name: 'Travel Booking', code: 'TRV', headId: 'usr-07', color: '#0ea5e9' },
  { id: 'dep-hotel', name: 'Hotel Reservations', code: 'HTL', headId: 'usr-10', color: '#14b8a6' },
  { id: 'dep-ofr', name: 'OneFineRate', code: 'OFR', headId: 'usr-12', color: '#f59e0b' },
  { id: 'dep-bcf', name: 'Business Class Flights', code: 'BCF', headId: 'usr-07', color: '#6366f1' },
  { id: 'dep-eng', name: 'Engineering', code: 'ENG', headId: 'usr-05', color: '#64748b' },
]

export const mockUsers = [
  { id: 'usr-01', name: 'Katrine Daniel', email: 'katrine.daniel@skylinevoyages.example', title: 'Head of Talent Acquisition', role: 'Admin', departmentId: null, status: 'active' },
  { id: 'usr-02', name: 'Rohan Mehta', email: 'rohan.mehta@skylinevoyages.example', title: 'Senior Recruiter', role: 'Recruiter', departmentId: 'dep-cc', status: 'active' },
  { id: 'usr-03', name: 'Sara Fernandes', email: 'sara.fernandes@skylinevoyages.example', title: 'Recruiter — Travel & Hospitality', role: 'Recruiter', departmentId: 'dep-travel', status: 'active' },
  { id: 'usr-04', name: 'Daniel Okafor', email: 'daniel.okafor@skylinevoyages.example', title: 'Technical Recruiter', role: 'Recruiter', departmentId: 'dep-eng', status: 'active' },
  { id: 'usr-05', name: 'Kavya Nair', email: 'kavya.nair@skylinevoyages.example', title: 'Engineering Manager', role: 'Hiring Manager', departmentId: 'dep-eng', status: 'active' },
  { id: 'usr-06', name: 'Arjun Kapoor', email: 'arjun.kapoor@skylinevoyages.example', title: 'Contact Center Operations Manager', role: 'Hiring Manager', departmentId: 'dep-cc', status: 'active' },
  { id: 'usr-07', name: 'Leila Haddad', email: 'leila.haddad@skylinevoyages.example', title: 'Travel Operations Lead', role: 'Hiring Manager', departmentId: 'dep-travel', status: 'active' },
  { id: 'usr-08', name: 'Vikram Singh', email: 'vikram.singh@skylinevoyages.example', title: 'Team Lead — Voice Process', role: 'Interviewer', departmentId: 'dep-cc', status: 'active' },
  { id: 'usr-09', name: 'Ana Torres', email: 'ana.torres@skylinevoyages.example', title: 'Senior Software Engineer', role: 'Interviewer', departmentId: 'dep-eng', status: 'active' },
  { id: 'usr-10', name: 'Farhan Ali', email: 'farhan.ali@skylinevoyages.example', title: 'Reservations Supervisor', role: 'Interviewer', departmentId: 'dep-hotel', status: 'active' },
  { id: 'usr-11', name: 'Neha Joshi', email: 'neha.joshi@skylinevoyages.example', title: 'HR Business Partner', role: 'Interviewer', departmentId: null, status: 'active' },
  { id: 'usr-12', name: 'Tom Becker', email: 'tom.becker@skylinevoyages.example', title: 'Revenue Manager — OneFineRate', role: 'Hiring Manager', departmentId: 'dep-ofr', status: 'active' },
  { id: 'usr-13', name: 'Priya Desai', email: 'priya.desai@skylinevoyages.example', title: 'Recruitment Coordinator', role: 'Recruiter', departmentId: null, status: 'invited' },
]

export const RECRUITER_IDS = ['usr-02', 'usr-03', 'usr-04', 'usr-01']
