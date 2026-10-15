'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FileSpreadsheetIcon, XIcon } from 'lucide-react'
import { isApiError } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import { uploadQuestionnaire } from '@/lib/api/upload'
import { formatBytes } from '@/lib/files'
import { QUESTIONNAIRE_ACCEPT, questionnaireFileProblem } from '@/lib/questionnaires'
import {
  questionnaireUploadSchema,
  type QuestionnaireUploadInput,
} from '@/lib/schemas/questionnaires'
import { useOrgSlug } from '@/components/providers/session-provider'
import { FileDropzone } from '@/components/file-dropzone'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { questionnairePaths } from '@/features/questionnaires/paths'

/** Step 1: the client's file, with a name for it. Column mapping comes next. */
export function QuestionnaireUploadPage() {
  const org = useOrgSlug()
  const router = useRouter()
  const qc = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<QuestionnaireUploadInput>({
    resolver: zodResolver(questionnaireUploadSchema),
    defaultValues: { name: '', client: '' },
  })

  const onValid = async (values: QuestionnaireUploadInput) => {
    setFormError(null)
    if (!file) {
      setFileError('Choose the questionnaire file.')
      return
    }
    setProgress(0)
    try {
      const q = await uploadQuestionnaire(org, values, file, setProgress)
      qc.setQueryData(qk.questionnaires.detail(org, q.id), q)
      void qc.invalidateQueries({ queryKey: qk.questionnaires.all(org) })
      toast.success(`Uploaded ${q.fileName}. Now choose its columns.`)
      router.push(questionnairePaths.view(org, q.id))
    } catch (e) {
      setProgress(null)
      if (isApiError(e) && e.fields?.file) setFileError(e.fields.file)
      if (isApiError(e) && applyFieldErrors(e.fields, form.setError)) return
      setFormError(isApiError(e) ? e.message : 'The upload failed. Try again.')
    }
  }

  return (
    <div className="flex max-w-2xl flex-col">
      <PageHeader
        title="Upload a questionnaire"
        breadcrumbs={[
          { label: 'Questionnaires', href: questionnairePaths.list(org) },
          { label: 'Upload' },
        ]}
        description="CSV or Excel (.xlsx), up to 500 questions. You’ll choose which column holds the questions next."
      />
      <Card>
        <CardContent className="flex flex-col gap-4 p-5">
          <form
            onSubmit={(e) => void form.handleSubmit(onValid)(e)}
            className="flex flex-col gap-4"
            noValidate
          >
            <FormError message={formError} />
            <FormField label="Name" error={form.formState.errors.name?.message} required>
              <Input
                {...form.register('name')}
                placeholder="Vendor security assessment 2026"
                autoComplete="off"
              />
            </FormField>
            <FormField
              label="Client"
              hint="Who sent it."
              error={form.formState.errors.client?.message}
              required
            >
              <Input
                {...form.register('client')}
                placeholder="Harbor Point Savings Bank"
                autoComplete="off"
              />
            </FormField>
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">
                File <span className="text-bad">*</span>
              </span>
              {file ? (
                <div className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                  <FileSpreadsheetIcon className="size-5 text-ok" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-base">{file.name}</span>
                    <span className="text-xs text-muted">{formatBytes(file.size)}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setFile(null)}
                    disabled={progress !== null}
                  >
                    <XIcon />
                  </Button>
                </div>
              ) : (
                <FileDropzone
                  label="Drop the questionnaire here, or browse"
                  hint="CSV or Excel (.xlsx), up to 10 MB"
                  accept={QUESTIONNAIRE_ACCEPT}
                  validate={questionnaireFileProblem}
                  onSelect={(f) => {
                    setFile(f)
                    setFileError(null)
                  }}
                />
              )}
              {fileError ? (
                <p role="alert" className="text-sm text-bad">
                  {fileError}
                </p>
              ) : null}
            </div>
            {progress !== null ? (
              <Progress value={Math.round(progress * 100)} aria-label="Upload progress" />
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(questionnairePaths.list(org))}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={progress !== null}>
                {progress !== null ? 'Uploading…' : 'Upload and continue'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
