'use client'

import { useId, useRef, useState, type DragEvent } from 'react'
import { UploadCloudIcon, XIcon } from 'lucide-react'
import { isApiError } from '@/lib/api/client'
import type { FileRef } from '@/lib/api/types'
import { uploadFile } from '@/lib/api/upload'
import { ACCEPT_ATTRIBUTE, formatBytes, MAX_UPLOAD_BYTES, uploadProblem } from '@/lib/files'
import { cn } from '@/lib/utils/cn'
import { useOrgSlug } from '@/components/providers/session-provider'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

/**
 * Drag and drop or browse for one file. Checks size and type before uploading,
 * shows progress, and hands back the uploaded file's metadata.
 */
export function FileDropzone({
  onUploaded,
  label = 'Attach a file',
  hint,
  disabled,
  className,
}: {
  onUploaded: (file: FileRef) => void
  label?: string
  hint?: string
  disabled?: boolean
  className?: string
}) {
  const org = useOrgSlug()
  const inputId = useId()
  const input = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  const [over, setOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [upload, setUpload] = useState<{ name: string; progress: number } | null>(null)

  const start = async (file: File | undefined) => {
    if (!file || upload) return
    setError(null)
    const problem = uploadProblem(file)
    if (problem) {
      setError(problem)
      return
    }
    abort.current = new AbortController()
    setUpload({ name: file.name, progress: 0 })
    try {
      const ref = await uploadFile(
        org,
        file,
        (progress) => setUpload({ name: file.name, progress }),
        abort.current.signal,
      )
      onUploaded(ref)
    } catch (e) {
      if (!(isApiError(e) && e.code === 'aborted')) {
        setError(isApiError(e) ? e.message : 'The upload failed. Try again.')
      }
    } finally {
      setUpload(null)
      abort.current = null
      if (input.current) input.current.value = ''
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    if (!disabled) void start(e.dataTransfer.files[0])
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        data-testid="file-dropzone"
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border border-dashed border-line bg-surface px-4 py-5 text-center',
          over && 'border-accent bg-accent-soft',
          disabled && 'opacity-60',
        )}
      >
        {upload ? (
          <div className="flex w-full max-w-sm flex-col gap-2" aria-live="polite">
            <p className="truncate text-sm">
              Uploading <span className="font-medium">{upload.name}</span>…{' '}
              <span className="tabular-nums">{Math.round(upload.progress * 100)}%</span>
            </p>
            <Progress value={upload.progress * 100} aria-label={`Uploading ${upload.name}`} />
            <Button
              variant="ghost"
              size="sm"
              className="self-center"
              onClick={() => abort.current?.abort()}
            >
              <XIcon aria-hidden="true" /> Cancel
            </Button>
          </div>
        ) : (
          <>
            <UploadCloudIcon className="size-6 text-muted" aria-hidden="true" />
            <p className="text-base">
              Drop a file here, or{' '}
              <label
                htmlFor={inputId}
                className={cn(
                  'cursor-pointer font-medium text-accent underline-offset-2 hover:underline',
                  disabled && 'pointer-events-none',
                )}
              >
                browse
              </label>
              <span className="sr-only"> ({label})</span>
            </p>
            <p className="text-xs text-muted">
              {hint ??
                `PDF, Word, Excel, CSV, text or images, up to ${formatBytes(MAX_UPLOAD_BYTES)}.`}
            </p>
          </>
        )}
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          disabled={disabled || Boolean(upload)}
          onChange={(e) => void start(e.target.files?.[0])}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/** File name, size and a download link. */
export function FileLink({ file, className }: { file: FileRef; className?: string }) {
  const org = useOrgSlug()
  return (
    <a
      href={`/api/v1/orgs/${org}/files/${file.id}`}
      className={cn(
        'inline-flex min-w-0 items-center gap-2 hover:text-accent hover:underline',
        className,
      )}
      download
    >
      <span className="truncate">{file.name}</span>
      <span className="shrink-0 text-xs text-muted">{formatBytes(file.size)}</span>
    </a>
  )
}
