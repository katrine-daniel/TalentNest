import { useRef, useState } from 'react'
import { FileText, UploadCloud, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatFileSize, validateResumeFile, RESUME_ACCEPT } from '@/utils/validation'

/** Drag-and-drop or click-to-browse file picker with validation. */
export default function FileDropzone({
  file,
  onFile,
  onClear,
  accept = RESUME_ACCEPT,
  validate = validateResumeFile,
  hint = 'PDF or Word, up to 5 MB',
  disabled,
}) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState(null)

  const handle = (f) => {
    const msg = validate(f)
    setError(msg)
    if (!msg) onFile(f)
  }

  if (file) {
    return (
      <div className="border-line bg-subtle/60 flex items-center gap-3 rounded-lg border px-3 py-2.5">
        <span className="bg-brand-50 text-brand-600 flex h-9 w-9 items-center justify-center rounded-md">
          <FileText size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{file.name ?? file.fileName}</p>
          <p className="text-muted text-xs">{formatFileSize(file.size)}</p>
        </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="text-muted hover:text-ink rounded-md p-1.5 hover:bg-white"
            aria-label="Remove file"
          >
            <X size={16} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files?.[0]
          if (f) handle(f)
        }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition-colors',
          dragging ? 'border-brand-500 bg-brand-50' : 'border-line-strong hover:border-brand-300 hover:bg-subtle/60',
          error && 'border-red-300',
        )}
      >
        <UploadCloud size={20} className={dragging ? 'text-brand-600' : 'text-faint'} aria-hidden />
        <span className="text-sm">
          <span className="text-brand-600 font-medium">Choose a file</span> or drag it here
        </span>
        <span className="text-muted text-xs">{hint}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handle(f)
          e.target.value = ''
        }}
      />
      {error && (
        <p className="mt-1.5 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
