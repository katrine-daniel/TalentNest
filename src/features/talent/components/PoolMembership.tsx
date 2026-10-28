import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Library, Plus, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Select } from '@/components/ui/FormControls'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { useCollection } from '@/hooks/useStore'
import { useSession } from '@/app/providers/SessionContext'
import { talentService } from '../talentService'

/** Shows and edits which talent pools a candidate belongs to. */
export default function PoolMembership({ candidateId }: { candidateId: string }) {
  const pools = useCollection('talentPools')
  const { can } = useSession()
  const [poolId, setPoolId] = useState('')
  const add = useAsyncAction((id: string) => talentService.addToPool(id, [candidateId]), { success: 'Added to pool' })
  const remove = useAsyncAction((id: string) => talentService.removeFromPool(id, candidateId), { success: 'Removed from pool' })
  const member = pools.filter((p) => p.candidateIds.includes(candidateId))
  const available = pools.filter((p) => !p.candidateIds.includes(candidateId))
  const editable = can('talent.manage')

  return (
    <div className="space-y-3">
      {member.length ? (
        <ul className="space-y-1.5">
          {member.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <Library size={14} className="text-faint" aria-hidden />
              <Link to={`/talent?pool=${p.id}`} className="min-w-0 flex-1 truncate hover:underline">
                {p.name}
              </Link>
              {editable && <Button size="xs" variant="ghost" iconOnly icon={X} aria-label={`Remove from ${p.name}`} onClick={() => remove.run(p.id)} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted text-sm">Not in any talent pool.</p>
      )}
      {editable && available.length > 0 && (
        <div className="flex gap-2">
          <Select
            aria-label="Talent pool"
            value={poolId}
            onChange={(e) => setPoolId(e.target.value)}
            options={available.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Add to pool…"
          />
          <Button
            icon={Plus}
            iconOnly
            aria-label="Add to selected pool"
            disabled={!poolId}
            loading={add.pending}
            onClick={async () => {
              const res = await add.run(poolId)
              if (res.ok) setPoolId('')
            }}
          />
        </div>
      )}
    </div>
  )
}
