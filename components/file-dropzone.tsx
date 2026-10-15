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
 * Drag and drop or browse for one file. Checks size and type first.
 *
 * By default it uploads the file at once, shows progress and hands back the uploaded
 * file's metadata (`onUploaded`). With `onSelect` it only checks and hands back the
 * file itself, for forms that send the file together with their other fields.
 */
export function FileDropzone({
  onUploaded,
  onSelect,
  selected,
  label = 'Attach a file',
  hint,
  disabled,
  className,
  accept = ACCEPT_ATTRIBUTE,
  validate = uploadProblem,
}: {
  onUploaded?: (file: FileRef) => void
  /** Select-only mode: no upload. `null` means the file was removed. */
  onSelect?: (file: File | null) => void
  /** The file chosen so far in select-only mode. */
  selected?: File | null
  label?: string
  hint?: string
  disabled?: boolean
  className?: string
  /** File input `accept` attribute (defaults to every supported upload type). */
  accept?: string
  /** Returns why a file can't be used, or null (defaults to the general upload rules). */
  validate?: (file: File) => string | null
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
    const problem = validate(file)
    if (problem) {
      setError(problem)
      return
    }
    if (onSelect) {
      onSelect(file)
      if (input.current) input.current.value = ''
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
      onUploaded?.(ref)
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
        {selected ? (
          <div className="flex w-full max-w-sm items-center justify-between gap-3">
            <p className="min-w-0 truncate text-base">
              <span className="font-medium">{selected.name}</span>{' '}
              <span className="text-xs text-muted">{formatBytes(selected.size)}</span>
            </p>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                setError(null)
                onSelect?.(null)
              }}
            >
              <XIcon aria-hidden="true" /> Remove
              <span className="sr-only"> {selected.name}</span>
            </Button>
          </div>
        ) : upload ? (
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
          aria-label={label}
          accept={accept}
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
