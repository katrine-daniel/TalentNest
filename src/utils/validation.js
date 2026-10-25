// Shared react-hook-form rule objects so every form validates the same way.

export const rules = {
  required: (label = 'This field') => ({ required: `${label} is required` }),
  email: {
    required: 'Email is required',
    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, message: 'Enter a valid email address' },
  },
  phone: {
    pattern: { value: /^[+\d][\d\s()-]{7,18}$/, message: 'Enter a valid phone number' },
  },
  name: (label = 'Name') => ({
    required: `${label} is required`,
    minLength: { value: 2, message: `${label} must be at least 2 characters` },
    maxLength: { value: 60, message: `${label} must be under 60 characters` },
  }),
  positiveInt: (label = 'Value', { min = 0, max = 999 } = {}) => ({
    required: `${label} is required`,
    valueAsNumber: true,
    min: { value: min, message: `${label} must be at least ${min}` },
    max: { value: max, message: `${label} must be ${max} or less` },
  }),
  futureDate: {
    required: 'Date is required',
    validate: (v) => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const [y, m, d] = String(v).split('-').map(Number)
      return new Date(y, m - 1, d) >= today || 'Choose today or a future date'
    },
  },
}

export const RESUME_ACCEPT = '.pdf,.doc,.docx'
export const RESUME_MAX_BYTES = 5 * 1024 * 1024

export function validateResumeFile(file) {
  if (!file) return 'Choose a file to upload'
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!['pdf', 'doc', 'docx'].includes(ext)) return 'Upload a PDF or Word document'
  if (file.size > RESUME_MAX_BYTES) return 'File must be 5 MB or smaller'
  return null
}

export function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
