import { useSearchParams } from 'react-router-dom'
import { FlaskConical, Lock } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import EmptyState from '@/components/ui/EmptyState'
import AIAssistant from '@/features/ai/components/AIAssistant'
import { useSession } from '@/app/providers/SessionContext'
import { AI_MODE } from './aiService'

export default function AIAssistantPage() {
  const [params] = useSearchParams()
  const { can } = useSession()

  if (!can('ai.use')) {
    return <EmptyState icon={Lock} title="AI assistant isn’t enabled for your role" description="Ask an administrator for the “Use AI hiring assistant” permission." />
  }

  return (
    <div>
      <PageHeader title="AI Hiring Assistant" description="Extract resumes, compare skills, prepare questions and draft emails — with sources for every answer.">
        {!AI_MODE.live && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-line-strong px-2 py-1 text-xs text-muted">
            <FlaskConical size={13} aria-hidden /> {AI_MODE.label} — no live AI service is connected
          </p>
        )}
      </PageHeader>
      <AIAssistant initialCandidateId={params.get('candidate') ?? ''} initialJobId={params.get('job') ?? ''} />
    </div>
  )
}
