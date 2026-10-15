'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useCreateSystem, useUpdateSystem } from '@/lib/api/hooks/use-security'
import { api, isApiError, orgPath } from '@/lib/api/client'
import type { SystemSummary, SystemType } from '@/lib/api/types'
import { systemFormSchema, type SystemFormValues } from '@/lib/schemas/security'
import { SYSTEM_TYPE_LABELS } from '@/lib/security'
import { useSession } from '@/components/providers/session-provider'
import { ConflictDialog } from '@/components/conflict-dialog'
import { ClassificationSelect } from '@/components/form/classification-select'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PeoplePicker } from '@/components/form/people-picker'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { securityPaths } from '@/features/security/paths'
import { securityCrumbs } from '@/features/security/shared'
import { useRecordConflict } from '@/features/privacy/use-conflict'

function valuesOf(s: SystemSummary): SystemFormValues {
  return {
    name: s.name,
    type: s.type,
    provider: s.provider,
    owner: s.owner,
    classification: s.classification,
    hosting: s.hosting,
    holdsPersonalData: s.holdsPersonalData,
    notes: s.notes,
  }
}

function describe(v: SystemFormValues): string {
  return [
    `Name: ${v.name}`,
    `Type: ${SYSTEM_TYPE_LABELS[v.type]}`,
    `Provider: ${v.provider}`,
    `Classification: ${v.classification}`,
    `Hosting: ${v.hosting}`,
    `Holds personal data: ${v.holdsPersonalData ? 'Yes' : 'No'}`,
    `Notes: ${v.notes}`,
  ].join('\n')
}

export function SystemForm({ record }: { record?: SystemSummary }) {
  const { org, user } = useSession()
  const router = useRouter()
  const create = useCreateSystem(org.slug)
  const update = useUpdateSystem(org.slug, record?.id ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  const [baseVersion, setBaseVersion] = useState(record?.version ?? 0)
  const form = useForm<SystemFormValues>({
    resolver: zodResolver(systemFormSchema),
    defaultValues: record
      ? valuesOf(record)
      : {
          name: '',
          type: 'saas',
          provider: '',
          owner: user.id,
          classification: 'internal',
          hosting: '',
          holdsPersonalData: false,
          notes: '',
        },
  })
  const { register, control, handleSubmit, setError, getValues, reset, formState } = form
  const errors = formState.errors
  const conflict = useRecordConflict(
    () => api.get<SystemSummary>(orgPath(org.slug, `/systems/${record?.id ?? ''}`)),
    (s) => describe(valuesOf(s)),
  )

  const save = (values: SystemFormValues, ifVersion = baseVersion) => {
    setFormError(null)
    const onError = (e: unknown) => {
      if (isApiError(e) && e.isConflict && record) return conflict.start()
      if (isApiError(e) && applyFieldErrors(e.fields, setError)) {
        setFormError('Some fields need attention.')
        return
      }
      setFormError(isApiError(e) ? e.message : 'Couldn’t save. Try again.')
    }
    const done = (s: SystemSummary) => {
      toast.success(record ? `Saved ${s.ref}` : `Added ${s.ref}`)
      router.push(securityPaths.systemView(org.slug, s.id))
    }
    if (record) update.mutate({ ...values, ifVersion }, { onSuccess: done, onError })
    else create.mutate(values, { onSuccess: done, onError })
  }

  const cancelHref = record
    ? securityPaths.systemView(org.slug, record.id)
    : securityPaths.systems(org.slug)
  const pending = create.isPending || update.isPending

  return (
    <form onSubmit={handleSubmit((v) => save(v))} noValidate className="flex flex-col gap-4">
      <PageHeader
        title={record ? `Edit ${record.ref}` : 'New system'}
        breadcrumbs={securityCrumbs(
          { label: 'Systems', href: securityPaths.systems(org.slug) },
          ...(record ? [{ label: record.ref, href: cancelHref }] : []),
          { label: record ? 'Edit' : 'New' },
        )}
        className="pb-0"
      />
      <FormError message={formError} />
      <Card className="max-w-3xl">
        <CardContent className="flex flex-col gap-4">
          <FormField label="Name" error={errors.name?.message} required>
            <Input {...register('name')} autoComplete="off" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <FormField id="sys-type" label="Type" required>
                  <Select
                    value={field.value}
                    onValueChange={(v) => field.onChange(v as SystemType)}
                  >
                    <SelectTrigger id="sys-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SYSTEM_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            />
            <FormField label="Provider" error={errors.provider?.message} required>
              <Input {...register('provider')} autoComplete="off" />
            </FormField>
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
              name="classification"
              render={({ field }) => (
                <FormField id="sys-class" label="Classification" required>
                  <ClassificationSelect
                    id="sys-class"
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormField>
              )}
            />
          </div>
          <FormField label="Hosting" hint="Where it runs, e.g. “Azure Southeast Asia”.">
            <Input {...register('hosting')} autoComplete="off" />
          </FormField>
          <Controller
            control={control}
            name="holdsPersonalData"
            render={({ field }) => (
              <label className="flex items-center gap-3 text-base">
                <Switch checked={field.value} onCheckedChange={field.onChange} />
                Holds personal data
              </label>
            )}
          />
          <FormField label="Notes" error={errors.notes?.message}>
            <Textarea {...register('notes')} rows={3} />
          </FormField>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Saving…' : record ? 'Save changes' : 'Add system'}
            </Button>
            <Button asChild variant="secondary">
              <Link href={cancelHref}>Cancel</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
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
