# TalentNest — Recruitment & Talent Management (frontend)

A React + Vite frontend for an HR recruitment system serving call center services, travel booking,
hotel reservations, OneFineRate and business-class flight teams. It runs entirely on a **mock data
layer** today and is structured so a real backend, calendar, email, assessment and AI services can be
connected later.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/
```

Copy `.env.example` to `.env.local` to configure future API endpoints. Never put private keys in
`VITE_*` variables — they are shipped to the browser.

## Stack

React 18 · Vite 5 · Tailwind CSS v4 · React Router 6 · Framer Motion · Recharts · React Hook Form ·
Lucide icons · @dnd-kit (pipeline drag-and-drop). Plain JavaScript (JSX).

## What's mocked (and clearly labelled in the UI)

| Area                                | Today                                                                  | Where to integrate                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Data storage                        | In-memory store persisted to `localStorage` (`src/services/mockDb.js`) | Replace `mockRequest(...)` calls in `src/services/*Service.js` with `http(...)` from `apiClient.js` |
| Resume upload                       | Stores file name/size only                                             | `candidateService.attachResume` → signed-URL upload                                                 |
| Calendar invites, reminders, emails | Recorded as status changes only; nothing is sent                       | `interviewService`, `assessmentService`, `offerService`                                             |
| AI assistant                        | Deterministic, locally generated "simulated" responses with sources    | `src/services/aiService.js` → backend AI proxy (`VITE_AI_PROXY_URL`)                                |
| Auth & permissions                  | Fixed demo user; "View as role" previews UI permissions                | Real auth + server-side authorization                                                               |

Use **Account menu → Reset demo data** (or Settings → Demo data) to restore the sample data.

## Project structure

```
src/
  components/
    layout/      App shell: AppLayout, Sidebar, Topbar, MobileNavigation, Breadcrumbs, GlobalSearch, …
    ui/          Design-system primitives: Button, Modal, Drawer, Dropdown, DataTable, Tabs, StatusBadge, …
    dashboard/   MetricCard, RecruitmentFunnel, HiringActivityChart, DepartmentBreakdown, UpcomingInterviews, …
    candidates/  CandidateTable/List/Filters/Form/Drawer, ApplicationCard, CandidateProfile sections, …
    jobs/        JobTable, JobForm, JobDetails, WorkflowBuilder
    pipeline/    PipelineBoard, PipelineColumn, CandidateCard, StageChangeDialog
    scheduling/  InterviewCalendar, ScheduleModal, AssessmentForm, InterviewFeedbackForm, EventDetailsDrawer, …
    offers/      OfferForm, OnboardingChecklist
    analytics/   HiringCharts, RecruitmentMetrics
    ai/          AIAssistant, AIMessage, ResumeInsights, SkillMatchPanel
    settings/    UserManagement, RolePermissions, DepartmentSettings, WorkflowSettings, …
  context/       SessionContext (demo user/role), GlobalActionsContext (app-wide create dialogs)
  hooks/         useStore, useCandidates, useJobs, useRecruitmentPipeline, useScheduling, useAI, …
  services/      mockDb, apiClient, candidate/job/pipeline/interview/assessment/offer/settings/ai/analytics services
  data/          Seed data generators (relative to today's date so the demo always looks current)
  pages/         Route-level screens (lazy loaded)
  routes/        AppRoutes
  utils/         formatDate, statusHelpers, validation, permissions, search, exportCsv
```

### Key design decisions

- **Per-vacancy workflows.** Vacancies copy stages from a workflow template (Software Engineering,
  Call Center, Travel Consultant, Hotel Reservations, Revenue & Distribution) and can then be customised.
  The pipeline board renders each vacancy's own stages.
- **Multiple applications per candidate.** Each application has its own stage, history, interviews,
  assessments and offer.
- **Confirmation for significant moves.** Moving backwards, skipping stages, or entering decision/offer/hired
  stages asks for confirmation and records a note in the stage history.
- **Assistive AI only.** The assistant never changes stages or rejects candidates.
- **Accessibility.** Keyboard-operable menus, dialogs with focus trapping, drag-and-drop with keyboard
  support (Space to pick up, ←/→ to change column, Space to drop) plus a "Move to" menu on every card,
  visible focus rings and `prefers-reduced-motion` support.
