import { useState } from 'react'
import { Download, FileUp } from 'lucide-react'
import { useAction, useDb } from '@/app/hooks'
import { useSession } from '@/app/session'
import { downloadCSV, parseCSV } from '@/lib/csv'
import { commitImport, IMPORT_COLUMNS, previewImport, type ImportPreview } from '@/services/employees'
import { validateFile } from '@/services/files'
import { ServiceError } from '@/services/store'
import { Button } from '@/components/ui/Button'
import { FormError } from '@/components/ui/Form'
import { Dialog } from '@/components/ui/Overlay'

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDb()
  const { account } = useSession()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ imported: number; failed: ImportPreview['errors'] } | null>(null)
  const commit = useAction(
    () => commitImport(account, preview as ImportPreview),
    (r) => `Imported ${r.imported} employee(s)`,
  )

  const reset = () => {
    setPreview(null)
    setFileName('')
    setError(null)
    setResult(null)
  }

  const onFile = async (file: File | undefined) => {
    reset()
    if (!file) return
    try {
      validateFile(file, ['csv'])
      const rows = parseCSV(await file.text())
      if (rows.length < 2) throw new ServiceError('The file has no data rows.')
      if (rows.length > 2001) throw new ServiceError('Import at most 2,000 rows at a time.')
      setFileName(file.name)
      setPreview(previewImport(db, rows))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the file.')
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Import employees from CSV"
      description="Rows are validated first. Nothing is saved until you confirm, and rows with errors are skipped."
      size="lg"
      footer={
        result ? (
          <Button
            variant="primary"
            onClick={() => {
              reset()
              onClose()
            }}
          >
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!preview?.valid.length}
              loading={commit.pending}
              onClick={async () => {
                const r = await commit.run()
                if (r.ok) setResult(r.value)
              }}
            >
              Import {preview?.valid.length ?? 0} row(s)
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-ink-soft">
          Required columns:{' '}
          <code className="bg-subtle rounded px-1 text-xs">first_name, last_name, work_email, title, department, location, employment_type, join_date</code>{' '}
          (YYYY-MM-DD). Optional: schedule, manager_email, personal_email, phone, employee_id. Department, location and type must match names configured in
          Organization.
        </p>
        <Button
          size="sm"
          variant="ghost"
          icon={Download}
          onClick={() =>
            downloadCSV(
              'peopleos-import-template.csv',
              [...IMPORT_COLUMNS],
              [
                [
                  'Ada',
                  'Lovelace',
                  'ada.lovelace@example.com',
                  'Analyst',
                  db.departments[0]?.name ?? '',
                  db.locations[0]?.name ?? '',
                  db.employmentTypes[0]?.name ?? '',
                  db.schedules[0]?.name ?? '',
                  '2026-01-05',
                  '',
                  '',
                  '',
                  '',
                ],
              ],
            )
          }
        >
          Download template
        </Button>
        {!result && (
          <label className="border-line-strong hover:border-brand-600 flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center">
            <FileUp size={20} className="text-muted" aria-hidden />
            <span className="font-medium">{fileName || 'Choose a CSV file'}</span>
            <span className="text-muted text-xs">Up to 10 MB, 2,000 rows</span>
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
        )}
        <FormError message={error} />
        {preview && !result && (
          <div>
            <p>
              <strong className="text-success">{preview.valid.length} valid</strong> ·{' '}
              <strong className={preview.errors.length ? 'text-danger' : ''}>{preview.errors.length} with errors</strong>
            </p>
            {preview.errors.length > 0 && (
              <ul className="border-line mt-2 max-h-56 divide-y overflow-y-auto rounded-md border">
                {preview.errors.map((e) => (
                  <li key={e.line} className="px-3 py-2 text-xs">
                    <span className="font-medium">Row {e.line}:</span> {e.messages.join(' ')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {result && (
          <div role="status">
            <p className="text-success font-medium">Imported {result.imported} employee record(s).</p>
            {result.failed.length > 0 && (
              <ul className="mt-2 text-xs">
                {result.failed.map((f) => (
                  <li key={f.line}>
                    Row {f.line}: {f.messages.join(' ')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}
