'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useCreateProcessing, useUpdateProcessing } from '@/lib/api/hooks/use-privacy'
import { api, isApiError, orgPath } from '@/lib/api/client'
import type { ProcessingActivitySummary, RecipientKind } from '@/lib/api/types'
import { LEGAL_BASIS_LABELS, RECIPIENT_KIND_LABELS } from '@/lib/privacy'
import { processingFormSchema, type ProcessingFormValues } from '@/lib/schemas/privacy'
import { useSession } from '@/components/providers/session-provider'
import { ConflictDialog } from '@/components/conflict-dialog'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PeoplePicker } from '@/components/form/people-picker'
import { TagInput } from '@/components/form/tag-input'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { privacyPaths } from '@/features/privacy/paths'
import { privacyCrumbs } from '@/features/privacy/shared'
import { useRecordConflict } from '@/features/privacy/use-conflict'

function valuesOf(p: ProcessingActivitySummary): ProcessingFormValues {
  return {
    name: p.name,
    purpose: p.purpose,
    legalBasis: p.legalBasis,
    dataSubjects: p.dataSubjects,
    dataCategories: p.dataCategories,
    sources: p.sources,
    recipients: p.recipients,
    crossBorder: p.crossBorder,
    retention: p.retention,
    owner: p.owner,
    status: p.status,
  }
}

/** Plain text of the form's fields, for the conflict diff. */
function describe(v: ProcessingFormValues): string {
  return [
    `Name: ${v.name}`,
    `Purpose: ${v.purpose}`,
    `Legal basis: ${LEGAL_BASIS_LABELS[v.legalBasis]}`,
    `Data subjects: ${v.dataSubjects.join(', ')}`,
    `Data categories: ${v.dataCategories.map((c) => (c.sensitive ? `${c.name} (sensitive)` : c.name)).join(', ')}`,
    `Sources: ${v.sources}`,
    `Recipients: ${v.recipients.map((r) => `${r.name} (${RECIPIENT_KIND_LABELS[r.kind]})`).join(', ')}`,
    `Cross-border: ${v.crossBorder.transfers ? v.crossBorder.countries.join(', ') : 'No'}`,
    `Retention: ${v.retention ?? 'Not set'}`,
    `Status: ${v.status}`,
  ].join('\n')
}

export function ProcessingForm({ record }: { record?: ProcessingActivitySummary }) {
  const { org, user } = useSession()
  const router = useRouter()
  const create = useCreateProcessing(org.slug)
  const update = useUpdateProcessing(org.slug, record?.id ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  const [baseVersion, setBaseVersion] = useState(record?.version ?? 0)

  const form = useForm<ProcessingFormValues>({
    resolver: zodResolver(processingFormSchema),
    defaultValues: record
      ? valuesOf(record)
      : {
          name: '',
          purpose: '',
          legalBasis: 'consent',
          dataSubjects: [],
          dataCategories: [{ name: '', sensitive: false }],
          sources: '',
          recipients: [],
          crossBorder: { transfers: false, countries: [] },
          retention: '',
          owner: user.id,
          status: 'draft',
        },
  })
  const { register, control, handleSubmit, setError, getValues, reset, formState } = form
  const errors = formState.errors
  const categories = useFieldArray({ control, name: 'dataCategories' })
  const recipients = useFieldArray({ control, name: 'recipients' })
  const transfers = useWatch({ control, name: 'crossBorder.transfers' })

  const conflict = useRecordConflict(
    () =>
      api.get<ProcessingActivitySummary>(
        orgPath(org.slug, `/processing-activities/${record?.id ?? ''}`),
      ),
    (p) => describe(valuesOf(p)),
  )

  const save = (values: ProcessingFormValues, ifVersion = baseVersion) => {
    setFormError(null)
    const body = { ...values, retention: values.retention?.trim() || null }
    const onError = (e: unknown) => {
      if (isApiError(e) && e.isConflict && record) return conflict.start()
      if (isApiError(e) && applyFieldErrors(e.fields, setError)) {
        setFormError('Some fields need attention.')
        return
      }
      setFormError(
        isApiError(e) ? e.message : 'Couldn’t save. Check your connection and try again.',
      )
    }
    const done = (saved: ProcessingActivitySummary) => {
      toast.success(record ? `Saved ${saved.ref}` : `Created ${saved.ref}`)
      router.push(privacyPaths.processingView(org.slug, saved.id))
    }
    if (record) update.mutate({ ...body, ifVersion }, { onSuccess: done, onError })
    else create.mutate(body, { onSuccess: done, onError })
  }

  const pending = create.isPending || update.isPending
  const cancelHref = record
    ? privacyPaths.processingView(org.slug, record.id)
    : privacyPaths.processing(org.slug)

  return (
    <form onSubmit={handleSubmit((v) => save(v))} noValidate className="flex flex-col gap-4">
      <PageHeader
        title={record ? `Edit ${record.ref}` : 'New processing record'}
        breadcrumbs={privacyCrumbs(
          { label: 'Processing records', href: privacyPaths.processing(org.slug) },
          ...(record ? [{ label: record.ref, href: cancelHref }] : []),
          { label: record ? 'Edit' : 'New' },
        )}
        className="pb-0"
      />
      <FormError message={formError} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">The activity</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FormField label="Name" error={errors.name?.message} required>
                <Input
                  {...register('name')}
                  autoComplete="off"
                  placeholder="For example: Payroll"
                />
              </FormField>
              <FormField
                label="Purpose"
                hint="Why the organisation processes this data."
                error={errors.purpose?.message}
                required
              >
                <Textarea {...register('purpose')} rows={3} />
              </FormField>
              <Controller
                control={control}
                name="legalBasis"
                render={({ field }) => (
                  <FormField
                    id="pa-basis"
                    label="Legal basis"
                    error={errors.legalBasis?.message}
                    required
                  >
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="pa-basis">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(LEGAL_BASIS_LABELS).map(([value, label]) => (
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
                name="dataSubjects"
                render={({ field }) => (
                  <FormField
                    label="Data subjects"
                    hint="Groups of people, for example Employees or Patients. Press Enter after each."
                    error={errors.dataSubjects?.message}
                    required
                  >
                    <TagInput value={field.value} onChange={field.onChange} />
                  </FormField>
                )}
              />
              <FormField
                label="Sources"
                hint="Where the data comes from."
                error={errors.sources?.message}
              >
                <Textarea {...register('sources')} rows={2} />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-col gap-1">
              <CardTitle className="text-base">Data categories</CardTitle>
              <CardDescription>
                Mark sensitive personal information: health, government-issued identifiers, and
                similar.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {categories.fields.map((f, i) => (
                <div key={f.id} className="flex flex-wrap items-start gap-3">
                  <div className="min-w-48 flex-1">
                    <Input
                      {...register(`dataCategories.${i}.name`)}
                      aria-label={`Data category ${i + 1}`}
                      aria-invalid={errors.dataCategories?.[i]?.name ? true : undefined}
                      placeholder="For example: Contact details"
                    />
                    {errors.dataCategories?.[i]?.name ? (
                      <p className="mt-1 text-sm text-bad">
                        {errors.dataCategories[i]?.name?.message}
                      </p>
                    ) : null}
                  </div>
                  <Controller
                    control={control}
                    name={`dataCategories.${i}.sensitive`}
                    render={({ field }) => (
                      <label className="flex h-8 items-center gap-2 text-sm">
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(v) => field.onChange(v === true)}
                        />
                        Sensitive
                      </label>
                    )}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => categories.remove(i)}
                    aria-label={`Remove data category ${i + 1}`}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              {errors.dataCategories?.message ? (
                <p className="text-sm text-bad">{errors.dataCategories.message}</p>
              ) : null}
              <Button
                variant="secondary"
                size="sm"
                className="w-fit"
                onClick={() => categories.append({ name: '', sensitive: false })}
              >
                <PlusIcon aria-hidden="true" /> Add category
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-col gap-1">
              <CardTitle className="text-base">Recipients and transfers</CardTitle>
              <CardDescription>
                Third parties need an agreement. Link one from the record once it’s saved.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                {recipients.fields.map((f, i) => (
                  <div key={f.id} className="flex flex-wrap items-start gap-3">
                    <div className="min-w-48 flex-1">
                      <Input
                        {...register(`recipients.${i}.name`)}
                        aria-label={`Recipient ${i + 1}`}
                        aria-invalid={errors.recipients?.[i]?.name ? true : undefined}
                        placeholder="Team or organisation"
                      />
                      {errors.recipients?.[i]?.name ? (
                        <p className="mt-1 text-sm text-bad">
                          {errors.recipients[i]?.name?.message}
                        </p>
                      ) : null}
                    </div>
                    <Controller
                      control={control}
                      name={`recipients.${i}.kind`}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={(v) => field.onChange(v as RecipientKind)}
                        >
                          <SelectTrigger className="w-52" aria-label={`Kind of recipient ${i + 1}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(RECIPIENT_KIND_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => recipients.remove(i)}
                      aria-label={`Remove recipient ${i + 1}`}
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-fit"
                  onClick={() => recipients.append({ name: '', kind: 'third_party' })}
                >
                  <PlusIcon aria-hidden="true" /> Add recipient
                </Button>
              </div>
              <Controller
                control={control}
                name="crossBorder.transfers"
                render={({ field }) => (
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-0.5">
                      <Label htmlFor="pa-cross-border">Transferred outside the Philippines</Label>
                      <p className="text-sm text-muted" id="pa-cross-border-hint">
                        Including cloud services hosted abroad.
                      </p>
                    </div>
                    <Switch
                      id="pa-cross-border"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-describedby="pa-cross-border-hint"
                    />
                  </div>
                )}
              />
              {transfers ? (
                <Controller
                  control={control}
                  name="crossBorder.countries"
                  render={({ field }) => (
                    <FormField
                      label="Countries"
                      error={errors.crossBorder?.countries?.message}
                      required
                    >
                      <TagInput
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="For example: Singapore"
                      />
                    </FormField>
                  )}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-18">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Controller
              control={control}
              name="owner"
              render={({ field }) => (
                <FormField label="Owner" error={errors.owner?.message} required>
                  <PeoplePicker value={field.value} onChange={field.onChange} />
                </FormField>
              )}
            />
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <FormField
                  id="pa-status"
                  label="Status"
                  hint="Auditors see approved records only."
                  error={errors.status?.message}
                >
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="pa-status" aria-describedby="pa-status-hint">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="retired">Retired</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            />
            <Controller
              control={control}
              name="retention"
              render={({ field }) => (
                <FormField
                  label="Retention"
                  hint="How long it’s kept, for example “5 years after the contract ends”."
                  error={errors.retention?.message}
                >
                  <Input
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                </FormField>
              )}
            />
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? 'Saving…' : record ? 'Save changes' : 'Create record'}
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
          mineText={describe(getValues())}
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
            reset(valuesOf(latest))
            toast.message('Reloaded the saved version. Your changes were discarded.')
          }}
        />
      ) : null}
    </form>
  )
}
