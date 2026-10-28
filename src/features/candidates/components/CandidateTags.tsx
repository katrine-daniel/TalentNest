import { useState } from 'react'
import { Pencil, Tag } from 'lucide-react'
import Button from '@/components/ui/Button'
import TagInput from '@/components/ui/TagInput'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { useCollection } from '@/hooks/useStore'
import { useSession } from '@/app/providers/SessionContext'
import { candidateService } from '../candidateService'
import type { Candidate } from '@/types/domain'

/** Inline editor for candidate tags (used for talent search and pools). */
export default function CandidateTags({ candidate }: { candidate: Candidate }) {
  const { actorId, can } = useSession()
  const all = useCollection('candidates')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string[]>(candidate.tags ?? [])
  const save = useAsyncAction((tags: string[]) => candidateService.setTags(candidate.id, tags, { actorId }), { success: 'Tags saved' })
  const suggestions = Array.from(new Set(all.flatMap((c) => c.tags ?? []))).sort()

  if (editing) {
    return (
      <div className="space-y-2">
        <TagInput value={draft} onChange={setDraft} suggestions={suggestions} placeholder="Add a tag and press Enter" aria-label="Candidate tags" />
        <div className="flex gap-2">
          <Button
            size="xs"
            variant="primary"
            loading={save.pending}
            onClick={async () => {
              const res = await save.run(draft)
              if (res.ok) setEditing(false)
            }}
          >
            Save tags
          </Button>
          <Button size="xs" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag size={13} className="text-faint" aria-hidden />
      {(candidate.tags ?? []).length ? (
        candidate.tags?.map((t) => (
          <span key={t} className="bg-brand-50 text-brand-700 rounded-md px-2 py-0.5 text-xs font-medium">
            {t}
          </span>
        ))
      ) : (
        <span className="text-faint text-xs">No tags</span>
      )}
      {can('candidates.manage') && (
        <Button
          size="xs"
          variant="ghost"
          iconOnly
          icon={Pencil}
          aria-label="Edit tags"
          onClick={() => {
            setDraft(candidate.tags ?? [])
            setEditing(true)
          }}
        />
      )}
    </div>
  )
}
