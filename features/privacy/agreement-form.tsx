'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { XIcon } from 'lucide-react'
import { useCreateAgreement, useUpdateAgreement } from '@/lib/api/hooks/use-privacy'
import { api, isApiError, orgPath } from '@/lib/api/client'
import type { AgreementRole, AgreementSummary, AgreementType, FileRef } from '@/lib/api/types'
import { formatBytes } from '@/lib/files'
import { AGREEMENT_ROLE_LABELS, AGREEMENT_TYPE_LABELS } from '@/lib/privacy'
import { agreementFormSchema, type AgreementFormValues } from '@/lib/schemas/privacy'
import { addMonthsToDate, todayInTz } from '@/lib/utils/dates'
import { useSession } from '@/components/providers/session-provider'
import { ConflictDialog } from '@/components/conflict-dialog'
import { FileDropzone } from '@/components/file-dropzone'
import { DateField } from '@/components/form/date-field'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PeoplePicker } from '@/components/form/people-picker'
import { RecordMultiPicker } from '@/components/form/record-picker'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { privacyPaths } from '@/features/privacy/paths'
import { privacyCrumbs } from '@/features/privacy/shared'
import { useRecordConflict } from '@/features/privacy/use-conflict'

function valuesOf(a: AgreementSummary): AgreementFormValues {
  return {
    counterparty: a.counterparty,
    type: a.type,
    role: a.role,
    signedAt: a.signedAt,
    renewsAt: a.renewsAt,
    fileId: a.fileId,
    owner: a.owner,
    notes: a.notes,
    processingActivityIds: a.processingActivityIds,
  }
}

function describe(v: AgreementFormValues, fileName: string | null): string {
  return [
    `Counterparty: ${v.counterparty}`,
    `Type: ${AGREEMENT_TYPE_LABELS[v.type]}`,
    `Our role: ${AGREEMENT_ROLE_LABELS[v.role]}`,
    `Signed: ${v.signedAt}`,
    `Renews: ${v.renewsAt ?? 'No fixed term'}`,
    `File: ${fileName ?? 'None'}`,
    `Processing records: ${v.processingActivityIds.length}`,
    `Notes: ${v.notes}`,
  ].join('\n')
}

export function AgreementForm({ record }: { record?: AgreementSummary }) {
  const { org, user } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const create = useCreateAgreement(org.slug)
  const update = useUpdateAgreement(org.slug, record?.id ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  const [file, setFile] = useState<FileRef | null>(record?.file ?? null)
  const [baseVersion, setBaseVersion] = useState(record?.version ?? 0)
  const processing = searchParams.get('processing')
  const form = useForm<AgreementFormValues>({
    resolver: zodResolver(agreementFormSchema),
    defaultValues: record
      ? valuesOf(record)
      : {
          counterparty: '',
          type: 'dpa',
          role: 'we_are_controller',
          signedAt: todayInTz(org.timezone),
          renewsAt: null,
          fileId: null,
          owner: user.id,
          notes: '',
          processingActivityIds: processing ? [processing] : [],
        },
  })
  const { register, control, handleSubmit, setError, setValue, getValues, reset, formState } = form
  const errors = formState.errors
  const conflict = useRecordConflict(
    () => api.get<AgreementSummary>(orgPath(org.slug, `/agreements/${record?.id ?? ''}`)),
    (a) => describe(valuesOf(a), a.file?.name ?? null),
  )

  const save = (values: AgreementFormValues, ifVersion = baseVersion) => {
    setFormError(null)
    const onError = (e: unknown) => {
      if (isApiError(e) && e.isConflict && record) return conflict.start()
      if (isApiError(e) && applyFieldErrors(e.fields, setError)) {
        setFormError('Some fields need attention.')
        return
      }
      setFormError(isApiError(e) ? e.message : 'Couldn’t save. Try again.')
    }
    const done = (a: AgreementSummary) => {
      toast.success(record ? `Saved ${a.ref}` : `Added ${a.ref}`)
      router.push(privacyPaths.agreementView(org.slug, a.id))
    }
    if (record) update.mutate({ ...values, ifVersion }, { onSuccess: done, onError })
    else create.mutate(values, { onSuccess: done, onError })
  }

  const cancelHref = record
    ? privacyPaths.agreementView(org.slug, record.id)
    : privacyPaths.agreements(org.slug)
  const pending = create.isPending || update.isPending

  return (
    <form onSubmit={handleSubmit((v) => save(v))} noValidate className="flex flex-col gap-4">
      <PageHeader
        title={record ? `Edit ${record.ref}` : 'New agreement'}
        breadcrumbs={privacyCrumbs(
          { label: 'Agreements', href: privacyPaths.agreements(org.slug) },
          ...(record ? [{ label: record.ref, href: cancelHref }] : []),
          { label: record ? 'Edit' : 'New' },
        )}
        className="pb-0"
      />
      <FormError message={formError} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <FormField
              label="Counterparty"
              hint="The other organisation."
              error={errors.counterparty?.message}
              required
            >
              <Input {...register('counterparty')} autoComplete="off" />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <FormField id="agr-type" label="Type" required>
                    <Select
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as AgreementType)}
                    >
                      <SelectTrigger id="agr-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(AGREEMENT_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
              />
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <FormField id="agr-role" label="Our role" required>
                    <Select
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as AgreementRole)}
                    >
                      <SelectTrigger id="agr-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(AGREEMENT_ROLE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
              />
            </div>
            <Controller
              control={control}
              name="processingActivityIds"
              render={({ field }) => (
                <FormField id="agr-processing" label="Processing records covered">
                  <RecordMultiPicker
                    type="processing_activity"
                    id="agr-processing"
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormField>
              )}
            />
            <div className="grid gap-1.5">
              <span className="text-sm font-medium">Signed copy</span>
              {file ? (
                <div className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-muted">{formatBytes(file.size)}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => {
                      setFile(null)
                      setValue('fileId', null, { shouldDirty: true })
                    }}
                  >
                    <XIcon />
                  </Button>
                </div>
              ) : (
                <FileDropzone
                  label="Attach the signed agreement"
                  onUploaded={(f) => {
                    setFile(f)
                    setValue('fileId', f.id, { shouldDirty: true })
                  }}
                />
              )}
              {errors.fileId ? <p className="text-sm text-bad">{errors.fileId.message}</p> : null}
            </div>
            <FormField label="Notes" error={errors.notes?.message}>
              <Textarea {...register('notes')} rows={3} />
            </FormField>
          </CardContent>
        </Card>
        <Card className="h-fit lg:sticky lg:top-18">
          <CardHeader>
            <CardTitle className="text-base">Dates and owner</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Controller
              control={control}
              name="signedAt"
              render={({ field }) => (
                <FormField label="Signed on" error={errors.signedAt?.message} required>
                  <DateField mode="date" value={field.value} onChange={field.onChange} />
                </FormField>
              )}
            />
            <Controller
              control={control}
              name="renewsAt"
              render={({ field }) => (
                <div className="flex flex-col gap-2">
                  <FormField label="Renews on" error={errors.renewsAt?.message}>
                    <DateField
                      mode="date"
                      value={field.value}
                      onChange={(v) => field.onChange(v || null)}
                    />
                  </FormField>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={field.value === null}
                      onCheckedChange={(v) =>
                        field.onChange(
                          v === true ? null : addMonthsToDate(getValues('signedAt'), 12),
                        )
                      }
                    />
                    No fixed term
                  </label>
                </div>
              )}
            />
            <Controller
              control={control}
              name="owner"
              render={({ field }) => (
                <FormField label="Owner" error={errors.owner?.message} required>
                  <PeoplePicker value={field.value} onChange={field.onChange} />
                </FormField>
              )}
            />
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? 'Saving…' : record ? 'Save changes' : 'Add agreement'}
              </Button>
              <Button asChild variant="secondary">
                <Link href={cancelHref}>Cancel</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      {record ? (
        <ConflictDialog
          open={conflict.open}
          onOpenChange={conflict.setOpen}
          theirs={conflict.theirs}
          mineText={describe(getValues(), file?.name ?? null)}
          pending={update.isPending}
          onOverwrite={() => {
            const latest = conflict.latest
            if (!latest) return
            setBaseVersion(latest.version)
            conflict.close()
            save(getValues(), latest.version)
          }}
          onDiscard={() => {
            const latest = conflict.latest
            conflict.close()
            if (!latest) return
            setBaseVersion(latest.version)
            setFile(latest.file)
            reset(valuesOf(latest))
            toast.message('Reloaded the saved version. Your changes were discarded.')
          }}
        />
      ) : null}
    </form>
  )
}
