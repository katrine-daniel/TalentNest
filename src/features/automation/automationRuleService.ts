import { dataStore } from '@/services/storage/dataStore'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { logActivity } from '@/services/activityService'
import { createId } from '@/utils/ids'
import type { AutomationRule } from '@/types/domain'
import { validateRule } from './automationEngine'

export type RuleInput = Pick<AutomationRule, 'name' | 'description' | 'trigger' | 'conditions' | 'actions' | 'enabled'>

function assertValid(input: RuleInput) {
  const result = validateRule(input, { users: dataStore.read('users'), onboardingTemplates: dataStore.read('onboardingTemplates') })
  if (!result.valid) throw new ServiceError(result.errors.join(' '))
}

export const automationRuleService = {
  async create(input: RuleInput, { actorId }: { actorId: string }) {
    assertValid(input)
    return mockRequest(() => {
      const now = new Date().toISOString()
      const rule: AutomationRule = { ...input, name: input.name.trim(), id: createId('rule'), createdById: actorId, createdAt: now, updatedAt: now }
      dataStore.write('automationRules', (list) => [...list, rule])
      logActivity({ type: 'automation', text: `Automation rule created: ${rule.name}`, actorId })
      return rule
    })
  },

  async update(id: string, input: RuleInput, { actorId }: { actorId: string }) {
    assertValid(input)
    return mockRequest(() => {
      let updated: AutomationRule | undefined
      dataStore.write('automationRules', (list) =>
        list.map((r) => (r.id === id ? (updated = { ...r, ...input, name: input.name.trim(), updatedAt: new Date().toISOString() }) : r)),
      )
      if (!updated) throw new ServiceError('Rule not found', 'not-found')
      logActivity({ type: 'automation', text: `Automation rule updated: ${updated.name}`, actorId })
      return updated
    })
  },

  async setEnabled(id: string, enabled: boolean, { actorId }: { actorId: string }) {
    return mockRequest(
      () => {
        let updated: AutomationRule | undefined
        dataStore.write('automationRules', (list) => list.map((r) => (r.id === id ? (updated = { ...r, enabled, updatedAt: new Date().toISOString() }) : r)))
        if (!updated) throw new ServiceError('Rule not found', 'not-found')
        logActivity({ type: 'automation', text: `Automation rule ${enabled ? 'enabled' : 'disabled'}: ${updated.name}`, actorId })
        return updated
      },
      { latency: 120 },
    )
  },

  async remove(id: string, { actorId }: { actorId: string }) {
    return mockRequest(() => {
      const rule = dataStore.read('automationRules').find((r) => r.id === id)
      dataStore.write('automationRules', (list) => list.filter((r) => r.id !== id))
      logActivity({ type: 'automation', text: `Automation rule deleted: ${rule?.name ?? id}`, actorId })
    })
  },
}
