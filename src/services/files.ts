/**
 * File storage for attachments and employee documents.
 * - Demo: files are kept in this browser's IndexedDB.
 * - Supabase: private `documents` bucket; downloads use short-lived signed URLs (see supabaseDriver).
 * Uploads are validated by extension, MIME type and size before they are stored.
 */
import { createId } from '@/lib/utils'
import { ServiceError } from './store'

export const MAX_FILE_BYTES = 10 * 1024 * 1024
const ALLOWED: Record<string, string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  csv: ['text/csv', 'application/vnd.ms-excel', 'text/plain'],
}

export function validateFile(file: File, allowed: string[] = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg']) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!allowed.includes(ext)) throw new ServiceError(`Unsupported file type. Allowed: ${allowed.join(', ').toUpperCase()}.`)
  // Browsers sometimes report an empty type; reject only a type that contradicts the extension.
  if (file.type && !(ALLOWED[ext] ?? []).includes(file.type)) throw new ServiceError('The file content type does not match its extension.')
  if (file.size === 0) throw new ServiceError('The file is empty.')
  if (file.size > MAX_FILE_BYTES) throw new ServiceError('Files must be 10 MB or smaller.')
}

export interface FileBackend {
  put(id: string, file: File): Promise<void>
  open(id: string): Promise<string>
  remove(id: string): Promise<void>
}

const DB_NAME = 'peopleos-files'
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore('files')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Local file storage is unavailable.'))
  })
}
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const r = run(db.transaction('files', mode).objectStore('files'))
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error ?? new Error('Local file storage failed.'))
  })
}

const demoBackend: FileBackend = {
  async put(id, file) {
    await tx('readwrite', (s) => s.put(file, id))
  },
  async open(id) {
    const blob = await tx<Blob | undefined>('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>)
    if (!blob) throw new ServiceError('This demo file is not stored in this browser (sample records have no files attached).', 'not_found')
    return URL.createObjectURL(blob)
  },
  async remove(id) {
    await tx('readwrite', (s) => s.delete(id))
  },
}

let backend: FileBackend = demoBackend

export const files = {
  use(next: FileBackend | null) {
    backend = next ?? demoBackend
  },
  async upload(file: File, folder: string, allowed?: string[]) {
    validateFile(file, allowed)
    const safe = file.name.replace(/[^\w.-]+/g, '_').slice(-80)
    const id = `${folder}/${createId('f')}-${safe}`
    await backend.put(id, file)
    return { fileId: id, name: file.name, size: file.size, mimeType: file.type || 'application/octet-stream' }
  },
  open: (id: string) => backend.open(id),
  remove: (id: string) => backend.remove(id),
}
