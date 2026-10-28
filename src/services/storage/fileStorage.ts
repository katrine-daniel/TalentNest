/**
 * Document storage for resumes and onboarding documents.
 *
 * - Demo mode: files are kept in this browser's IndexedDB (never uploaded).
 * - Supabase mode: files go to the private `documents` bucket under the
 *   organization's folder; downloads use short-lived signed URLs. Storage policies
 *   in supabase/migrations restrict access to members of that organization.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createId } from '@/utils/ids'
import type { StoredFileRef } from '@/types/domain'

export const ALLOWED_DOCUMENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024
const SIGNED_URL_SECONDS = 300

export class FileValidationError extends Error {}

/** Rejects unexpected file types and oversized files before anything is stored. */
export function validateDocument(file: { name: string; size: number; type?: string }, allowed: string[] = Object.keys(ALLOWED_DOCUMENT_TYPES)) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!allowed.includes(ext)) throw new FileValidationError(`Upload one of: ${allowed.map((e) => e.toUpperCase()).join(', ')}`)
  if (file.size > MAX_DOCUMENT_BYTES) throw new FileValidationError('Files must be 10 MB or smaller')
  if (file.size === 0) throw new FileValidationError('The file is empty')
  // Browsers report MIME types; when present they must agree with the extension.
  if (file.type && file.type !== ALLOWED_DOCUMENT_TYPES[ext] && !(ext === 'doc' && file.type === 'application/octet-stream')) {
    throw new FileValidationError('The file type does not match its extension')
  }
  return ext
}

export const safeFileName = (name: string) => name.replace(/[^\w.\- ]+/g, '_').slice(-120)

interface Backend {
  put(file: File, folder: string): Promise<StoredFileRef>
  url(ref: StoredFileRef): Promise<string>
  remove(ref: StoredFileRef): Promise<void>
}

// ---------------------------------------------------------------- IndexedDB (demo)
const DB_NAME = 'talentnest-files'
const STORE = 'files'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Could not open local file storage'))
  })
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = run(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result as T)
    req.onerror = () => reject(req.error ?? new Error('Local file storage failed'))
  })
}

const indexedDbBackend: Backend = {
  async put(file) {
    const fileId = createId('file')
    await idb('readwrite', (s) => s.put(file, fileId))
    return { fileId, fileName: safeFileName(file.name), size: file.size, mimeType: file.type, uploadedAt: new Date().toISOString() }
  },
  async url(ref) {
    if (!ref.fileId) throw new Error('This is sample data: only the file name is stored, not the document itself.')
    const blob = await idb<Blob | undefined>('readonly', (s) => s.get(ref.fileId as string))
    if (!blob) throw new Error('The file is no longer available in this browser.')
    return URL.createObjectURL(blob)
  },
  async remove(ref) {
    if (ref.fileId) await idb('readwrite', (s) => s.delete(ref.fileId as string))
  },
}

// ---------------------------------------------------------------- Supabase Storage
function supabaseBackend(client: SupabaseClient, orgId: string): Backend {
  const bucket = client.storage.from('documents')
  return {
    async put(file, folder) {
      const fileId = `${orgId}/${folder}/${createId('file')}-${safeFileName(file.name)}`
      const { error } = await bucket.upload(fileId, file, { contentType: file.type, upsert: false })
      if (error) throw new Error(`Upload failed: ${error.message}`)
      return { fileId, fileName: safeFileName(file.name), size: file.size, mimeType: file.type, uploadedAt: new Date().toISOString() }
    },
    async url(ref) {
      if (!ref.fileId) throw new Error('No stored file for this record.')
      const { data, error } = await bucket.createSignedUrl(ref.fileId, SIGNED_URL_SECONDS)
      if (error || !data) throw new Error('Could not create a secure download link.')
      return data.signedUrl
    },
    async remove(ref) {
      if (ref.fileId) await bucket.remove([ref.fileId])
    },
  }
}

let backend: Backend = indexedDbBackend

export const fileStorage = {
  useDemo() {
    backend = indexedDbBackend
  },
  useSupabase(client: SupabaseClient, orgId: string) {
    backend = supabaseBackend(client, orgId)
  },
  async upload(file: File, folder: 'resumes' | 'onboarding', allowed?: string[]) {
    validateDocument(file, allowed)
    return backend.put(file, folder)
  },
  url: (ref: StoredFileRef) => backend.url(ref),
  remove: (ref: StoredFileRef) => backend.remove(ref),
}
