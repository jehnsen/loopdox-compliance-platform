'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { api, isApiError, orgPath } from '@/lib/api/client'
import { useCreateUseCase, useUpdateUseCase } from '@/lib/api/hooks/use-ai'
import type { AiRiskLevel, AiUseCaseSummary } from '@/lib/api/types'
import { DATA_CATEGORY_SUGGESTIONS, RISK_LABELS } from '@/lib/ai'
import { useCaseFormSchema, type UseCaseFormValues } from '@/lib/schemas/ai'
import { useSession } from '@/components/providers/session-provider'
import { ConflictDialog } from '@/components/conflict-dialog'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PeoplePicker } from '@/components/form/people-picker'
import { TagInput } from '@/components/form/tag-input'
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
import { Textarea } from '@/components/ui/textarea'
import { aiCrumbs, aiPaths } from '@/features/ai-governance/shared'
import { useRecordConflict } from '@/features/privacy/use-conflict'

function valuesOf(u: AiUseCaseSummary): UseCaseFormValues {
  return {
    name: u.name,
    tool: u.tool,
    provider: u.provider,
    model: u.model,
    purpose: u.purpose,
    dataCategories: u.dataCategories,
    riskLevel: u.riskLevel,
    owner: u.owner,
    notes: u.notes,
  }
}

function describe(v: UseCaseFormValues): string {
  return [
    `Name: ${v.name}`,
    `Tool: ${v.tool}`,
    `Provider: ${v.provider}`,
    `Model: ${v.model}`,
    `Purpose: ${v.purpose}`,
    `Data categories: ${v.dataCategories.join(', ')}`,
    `Risk: ${v.riskLevel}`,
    `Notes: ${v.notes}`,
  ].join('\n')
}

export function UseCaseForm({ record }: { record?: AiUseCaseSummary }) {
  const { org, user } = useSession()
  const router = useRouter()
  const create = useCreateUseCase(org.slug)
  const update = useUpdateUseCase(org.slug, record?.id ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  const [baseVersion, setBaseVersion] = useState(record?.version ?? 0)
  const form = useForm<UseCaseFormValues>({
    resolver: zodResolver(useCaseFormSchema),
    defaultValues: record
      ? valuesOf(record)
      : {
          name: '',
          tool: '',
          provider: '',
          model: '',
          purpose: '',
          dataCategories: [],
          riskLevel: 'medium',
          owner: user.id,
          notes: '',
        },
  })
  const { register, control, handleSubmit, setError, getValues, reset, formState } = form
  const errors = formState.errors
  const conflict = useRecordConflict(
    () => api.get<AiUseCaseSummary>(orgPath(org.slug, `/ai/use-cases/${record?.id ?? ''}`)),
    (u) => describe(valuesOf(u)),
  )

  const save = (values: UseCaseFormValues, ifVersion = baseVersion) => {
    setFormError(null)
    const onError = (e: unknown) => {
      if (isApiError(e) && e.isConflict && record) return conflict.start()
      if (isApiError(e) && applyFieldErrors(e.fields, setError)) {
        setFormError('Some fields need attention.')
        return
      }
      setFormError(isApiError(e) ? e.message : 'Couldn’t save. Try again.')
    }
    const done = (u: AiUseCaseSummary) => {
      toast.success(record ? `Saved ${u.ref}` : `Added ${u.ref}`)
      router.push(aiPaths.useCase(org.slug, u.id))
    }
    if (record) update.mutate({ ...values, ifVersion }, { onSuccess: done, onError })
    else create.mutate(values, { onSuccess: done, onError })
  }

  const cancelHref = record ? aiPaths.useCase(org.slug, record.id) : aiPaths.inventory(org.slug)
  const pending = create.isPending || update.isPending

  return (
    <form onSubmit={handleSubmit((v) => save(v))} noValidate className="flex flex-col gap-4">
      <PageHeader
        title={record ? `Edit ${record.ref}` : 'New AI use case'}
        breadcrumbs={aiCrumbs(
          { label: 'Inventory', href: aiPaths.inventory(org.slug) },
          ...(record ? [{ label: record.ref, href: cancelHref }] : []),
          { label: record ? 'Edit' : 'New' },
        )}
        className="pb-0"
      />
      <FormError message={formError} />
      <Card className="max-w-3xl">
        <CardContent className="flex flex-col gap-4">
          <FormField label="Name" error={errors.name?.message} required>
            <Input
              {...register('name')}
              autoComplete="off"
              placeholder="e.g. Support ticket summarizer"
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Tool or app" error={errors.tool?.message} required>
              <Input {...register('tool')} autoComplete="off" placeholder="e.g. GitHub Copilot" />
            </FormField>
            <FormField label="Provider" error={errors.provider?.message} required>
              <Input {...register('provider')} autoComplete="off" placeholder="e.g. OpenAI" />
            </FormField>
            <FormField label="Model" error={errors.model?.message} required>
              <Input {...register('model')} autoComplete="off" placeholder="e.g. GPT-4o" />
            </FormField>
          </div>
          <FormField
            label="What it is used for"
            hint="Say who uses it and what for, in plain words."
            error={errors.purpose?.message}
            required
          >
            <Textarea {...register('purpose')} rows={3} />
          </FormField>
          <Controller
            control={control}
            name="dataCategories"
            render={({ field }) => (
              <FormField
                label="Data that goes in"
                hint={`For example ${DATA_CATEGORY_SUGGESTIONS.slice(0, 4).join(', ')}. Press Enter after each.`}
                error={errors.dataCategories?.message}
              >
                <TagInput value={field.value} onChange={field.onChange} />
              </FormField>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="riskLevel"
              render={({ field }) => (
                <FormField
                  id="uc-risk"
                  label="Risk level"
                  hint="Your first estimate. Assessing the use case sets the final rating."
                  required
                >
                  <Select
                    value={field.value}
                    onValueChange={(v) => field.onChange(v as AiRiskLevel)}
                  >
                    <SelectTrigger id="uc-risk">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(RISK_LABELS).map(([value, label]) => (
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
              name="owner"
              render={({ field }) => (
                <FormField label="Owner" error={errors.owner?.message} required>
                  <PeoplePicker value={field.value} onChange={field.onChange} />
                </FormField>
              )}
            />
          </div>
          <FormField label="Notes" error={errors.notes?.message}>
            <Textarea {...register('notes')} rows={3} />
          </FormField>
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? 'Saving…' : record ? 'Save changes' : 'Add use case'}
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
