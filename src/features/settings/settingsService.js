import { dataStore } from '@/services/storage/dataStore'
import { mockRequest, ServiceError } from '@/services/api/apiClient'
import { createId } from '@/utils/ids'

function upsert(collection, item, prefix) {
  const exists = item.id && dataStore.read(collection).some((x) => x.id === item.id)
  const record = exists ? item : { ...item, id: createId(prefix) }
  dataStore.write(collection, (list) => (exists ? list.map((x) => (x.id === record.id ? record : x)) : [...list, record]))
  return record
}

export const settingsService = {
  // Users -------------------------------------------------------------------
  /** Demo: creates an "invited" user record. No invitation email is sent. */
  async inviteUser(values) {
    return mockRequest(() => {
      if (dataStore.read('users').some((u) => u.email.toLowerCase() === values.email.toLowerCase())) {
        throw new ServiceError('A user with this email already exists')
      }
      return upsert('users', { ...values, departmentId: values.departmentId || null, status: 'invited' }, 'usr')
    })
  },

  async updateUser(id, patch) {
    return mockRequest(
      () => {
        let updated
        dataStore.write('users', (list) => list.map((u) => (u.id === id ? (updated = { ...u, ...patch }) : u)))
        return updated
      },
      { latency: 200 },
    )
  },

  // Roles -------------------------------------------------------------------
  async setRolePermissions(rolePermissions) {
    return mockRequest(() => dataStore.write('settings', (s) => ({ ...s, rolePermissions })))
  },

  // Departments ---------------------------------------------------------------
  async saveDepartment(values) {
    return mockRequest(() => {
      const dup = dataStore.read('departments').some((d) => d.id !== values.id && d.name.toLowerCase() === values.name.trim().toLowerCase())
      if (dup) throw new ServiceError('A department with this name already exists')
      return upsert('departments', { ...values, name: values.name.trim() }, 'dep')
    })
  },

  async deleteDepartment(id) {
    return mockRequest(() => {
      const used = dataStore.read('jobs').filter((j) => j.departmentId === id).length
      if (used) throw new ServiceError(`${used} vacancies belong to this department. Reassign them first.`)
      dataStore.write('departments', (list) => list.filter((d) => d.id !== id))
    })
  },

  // Workflow templates --------------------------------------------------------
  async saveWorkflowTemplate(values) {
    return mockRequest(
      () => {
        if (!values.name?.trim()) throw new ServiceError('Template name is required')
        if (values.stages.length < 3) throw new ServiceError('A workflow needs at least three stages')
        if (values.stages[0].type !== 'application') throw new ServiceError('The first stage must be an application stage')
        if (values.stages.at(-1).type !== 'hired') throw new ServiceError('The last stage must be a Hired stage')
        const stages = values.stages.map((s, i) => ({ key: s.key ?? `s${i}-${createId('k')}`, name: s.name.trim(), type: s.type }))
        return upsert('workflowTemplates', { ...values, stages }, 'wf')
      },
      { latency: 400 },
    )
  },

  async deleteWorkflowTemplate(id) {
    return mockRequest(() => {
      const used = dataStore.read('jobs').filter((j) => j.workflowTemplateId === id).length
      if (used) throw new ServiceError(`${used} vacancies were created from this template. It can't be deleted.`)
      dataStore.write('workflowTemplates', (list) => list.filter((t) => t.id !== id))
    })
  },

  // Notification preferences --------------------------------------------------
  async saveNotificationPrefs(prefs) {
    return mockRequest(() => dataStore.write('settings', (s) => ({ ...s, notificationPrefs: prefs })))
  },

  // Assessment templates & scorecards -----------------------------------------
  async saveAssessmentTemplate(values) {
    return mockRequest(() =>
      upsert(
        'assessmentTemplates',
        { ...values, durationMin: Number(values.durationMin), passMark: Number(values.passMark), questionCount: Number(values.questionCount) },
        'at',
      ),
    )
  },

  async saveScorecard(values) {
    return mockRequest(() => {
      const total = values.criteria.reduce((sum, c) => sum + Number(c.weight), 0)
      if (total !== 100) throw new ServiceError(`Criteria weights must add up to 100 (currently ${total})`)
      return upsert('scorecards', { ...values, criteria: values.criteria.map((c) => ({ ...c, id: c.id || createId('c'), weight: Number(c.weight) })) }, 'sc')
    })
  },

  // Demo data -----------------------------------------------------------------
  async resetDemoData() {
    return mockRequest(() => dataStore.reset(), { latency: 400 })
  },
}
