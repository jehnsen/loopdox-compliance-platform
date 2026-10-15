'use client'

import { useRef, useState, type FormEvent } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { isApiError } from '@/lib/api/client'
import { useControls, useUploadEvidence } from '@/lib/api/hooks/use-evidence'
import type { EvidenceResult } from '@/lib/api/types'
import { RESULT_LABELS } from '@/lib/evidence'
import { uploadEvidenceSchema, type UploadEvidenceValues } from '@/lib/schemas/evidence'
import { todayInTz } from '@/lib/utils/dates'
import { useSession } from '@/components/providers/session-provider'
import { DateField } from '@/components/form/date-field'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { FileDropzone } from '@/components/file-dropzone'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const RESULT_HINTS: Record<EvidenceResult, string> = {
  pass: 'It shows the control working. The control shows as passing.',
  fail: 'It shows a gap. The control shows as failing until newer passing evidence is added.',
  info: 'Context only, such as meeting notes. It doesn’t change the control’s status.',
}

/**
 * Upload a file as evidence for a control. The file and its details go in one request,
 * so the evidence can’t exist without its file.
 */
export function UploadEvidenceDialog({
  controlId,
  controlLabel,
  onClose,
}: {
  /** Set when opened from a control: the control can't be changed. */
  controlId?: string
  controlLabel?: string
  onClose: () => void
}) {
  const { org } = useSession()
  const upload = useUploadEvidence(org.slug)
  const controls = useControls(org.slug, { pageSize: 200 })
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const abort = useRef<AbortController | null>(null)
  const today = todayInTz(org.timezone)
  const form = useForm<UploadEvidenceValues>({
    resolver: zodResolver(uploadEvidenceSchema),
    defaultValues: { controlId: controlId ?? '', summary: '', result: 'pass', collectedOn: today },
  })
  const { control, register, handleSubmit, formState, setError: setFieldError } = form
  const errors = formState.errors
  const result = useWatch({ control, name: 'result' })

  const onValid = (values: UploadEvidenceValues) => {
    setError(null)
    if (!file) {
      setFileError('Choose the file that backs this evidence.')
      return
    }
    abort.current = new AbortController()
    setProgress(0)
    upload.mutate(
      { fields: values, file, onProgress: setProgress, signal: abort.current.signal },
      {
        onSuccess: (item) => {
          toast.success(`Evidence added to ${item.controlReference}`)
          onClose()
        },
        onError: (e) => {
          if (isApiError(e) && e.code === 'aborted') return
          if (isApiError(e) && e.fields?.file) setFileError(e.fields.file)
          if (isApiError(e) && applyFieldErrors(e.fields, setFieldError)) return
          setError(isApiError(e) ? e.message : 'The upload failed. Try again.')
        },
      },
    )
  }
  const submit = (e: FormEvent<HTMLFormElement>) => {
    // Say so about the file even while other fields still need attention.
    if (!file) setFileError('Choose the file that backs this evidence.')
    void handleSubmit(onValid)(e)
  }

  const busy = upload.isPending
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Upload evidence</DialogTitle>
            <DialogDescription>
              {controlLabel
                ? `Add a file that shows ${controlLabel} working, or failing.`
                : 'Add a file that shows a control working, or failing.'}
            </DialogDescription>
          </DialogHeader>
          <FormError message={error} />

          {controlId ? null : (
            <Controller
              control={control}
              name="controlId"
              render={({ field }) => (
                <FormField
                  id="evidence-control"
                  label="Control"
                  error={errors.controlId?.message}
                  required
                >
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="evidence-control">
                      <SelectValue placeholder="Choose a control" />
                    </SelectTrigger>
                    <SelectContent>
                      {(controls.data?.items ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.reference} {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            />
          )}

          <FormField
            label="What this shows"
            hint="One or two sentences an auditor can read without opening the file."
            error={errors.summary?.message}
            required
          >
            <Textarea
              {...register('summary')}
              rows={3}
              placeholder="e.g. Quarterly restore test: the staging database was restored in 52 minutes."
            />
          </FormField>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Result</legend>
            <div className="flex flex-wrap gap-4 text-base">
              {(['pass', 'fail', 'info'] as const).map((r) => (
                <label key={r} className="flex items-center gap-2">
                  <input type="radio" value={r} {...register('result')} />
                  {RESULT_LABELS[r]}
                </label>
              ))}
            </div>
            <p className="text-sm text-muted">{RESULT_HINTS[result]}</p>
          </fieldset>

          <Controller
            control={control}
            name="collectedOn"
            render={({ field }) => (
              <FormField label="Collected on" error={errors.collectedOn?.message}>
                <DateField
                  mode="date"
                  value={field.value ?? today}
                  onChange={field.onChange}
                  max={today}
                />
              </FormField>
            )}
          />

          <div className="grid gap-1.5">
            <span className="text-sm font-medium">
              File{' '}
              <span className="text-bad" aria-hidden="true">
                *
              </span>
            </span>
            <FileDropzone
              label="Choose the evidence file"
              selected={file}
              onSelect={(f) => {
                setFile(f)
                setFileError(null)
              }}
              disabled={busy}
            />
            {fileError ? (
              <p role="alert" className="text-sm text-bad">
                {fileError}
              </p>
            ) : null}
          </div>

          {busy ? (
            <div className="grid gap-1" aria-live="polite">
              <p className="text-sm">
                Uploading… <span className="tabular-nums">{Math.round(progress * 100)}%</span>
              </p>
              <Progress value={progress * 100} aria-label="Upload progress" />
            </div>
          ) : null}

          <DialogFooter>
            {busy ? (
              <Button type="button" variant="secondary" onClick={() => abort.current?.abort()}>
                Cancel upload
              </Button>
            ) : (
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            )}
            <Button type="submit" variant="primary" disabled={busy}>
              Upload evidence
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
