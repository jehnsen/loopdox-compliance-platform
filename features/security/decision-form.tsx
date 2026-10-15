'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useSaveDecision, useSupersedeDecision } from '@/lib/api/hooks/use-security'
import { api, isApiError, orgPath } from '@/lib/api/client'
import type { DecisionSummary } from '@/lib/api/types'
import { decisionFormSchema, type DecisionFormValues } from '@/lib/schemas/security'
import { todayInTz } from '@/lib/utils/dates'
import { useSession } from '@/components/providers/session-provider'
import { ConflictDialog } from '@/components/conflict-dialog'
import { IdChip } from '@/components/chips'
import { DateField } from '@/components/form/date-field'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PeoplePicker } from '@/components/form/people-picker'
import { RecordMultiPicker } from '@/components/form/record-picker'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useRecordConflict } from '@/features/privacy/use-conflict'
import { securityPaths } from '@/features/security/paths'
import { securityCrumbs } from '@/features/security/shared'

function valuesOf(d: DecisionSummary): DecisionFormValues {
  return {
    title: d.title,
    context: d.context,
    decision: d.decision,
    consequences: d.consequences,
    status: d.status === 'superseded' ? 'accepted' : d.status,
    decidedBy: d.decidedBy,
    decidedAt: d.decidedAt,
    systemIds: d.systemIds,
  }
}

function describe(v: DecisionFormValues): string {
  return [
    `Title: ${v.title}`,
    `Status: ${v.status}`,
    `Decided: ${v.decidedAt}`,
    `Systems: ${v.systemIds.length}`,
    `Context: ${v.context}`,
    `Decision: ${v.decision}`,
    `Consequences: ${v.consequences}`,
  ].join('\n')
}

/**
 * New decision, edit, or supersede. Superseding starts from the old decision's text and
 * saves a new accepted decision that replaces it.
 */
export function DecisionForm({
  record,
  supersedes,
}: {
  record?: DecisionSummary
  supersedes?: DecisionSummary
}) {
  const { org, user } = useSession()
  const router = useRouter()
  const save = useSaveDecision(org.slug, record?.id)
  const supersede = useSupersedeDecision(org.slug, supersedes?.id ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  const [baseVersion, setBaseVersion] = useState(record?.version ?? 0)
  const source = record ?? supersedes
  const form = useForm<DecisionFormValues>({
    resolver: zodResolver(decisionFormSchema),
    defaultValues: record
      ? valuesOf(record)
      : {
          title: supersedes?.title ?? '',
          context: supersedes ? `${supersedes.ref} no longer fits because: \n\n` : '',
          decision: supersedes?.decision ?? '',
          consequences: supersedes?.consequences ?? '',
          status: supersedes ? 'accepted' : 'proposed',
          decidedBy: user.id,
          decidedAt: todayInTz(org.timezone),
          systemIds: supersedes?.systemIds ?? [],
        },
  })
  const { register, control, handleSubmit, setError, getValues, reset, formState } = form
  const errors = formState.errors
  const conflict = useRecordConflict(
    () => api.get<DecisionSummary>(orgPath(org.slug, `/decisions/${record?.id ?? ''}`)),
    (d) => describe(valuesOf(d)),
  )

  const submit = (values: DecisionFormValues, ifVersion = baseVersion) => {
    setFormError(null)
    const onError = (e: unknown) => {
      if (isApiError(e) && e.isConflict) {
        if (record) return conflict.start()
        setFormError(
          `Someone changed ${supersedes?.ref ?? 'this decision'} while you were writing. Reload the page and try again.`,
        )
        return
      }
      if (isApiError(e) && applyFieldErrors(e.fields, setError)) {
        setFormError('Some fields need attention.')
        return
      }
      setFormError(isApiError(e) ? e.message : 'Couldn’t save. Try again.')
    }
    const done = (d: DecisionSummary) => {
      toast.success(
        supersedes
          ? `${d.ref} now replaces ${supersedes.ref}`
          : record
            ? `Saved ${d.ref}`
            : `Added ${d.ref}`,
      )
      router.push(securityPaths.decisionView(org.slug, d.id))
    }
    if (supersedes) {
      supersede.mutate(
        { ...values, status: 'accepted', ifVersion: supersedes.version },
        { onSuccess: done, onError },
      )
    } else {
      save.mutate(record ? { ...values, ifVersion } : values, { onSuccess: done, onError })
    }
  }

  const cancelHref = source
    ? securityPaths.decisionView(org.slug, source.id)
    : securityPaths.decisions(org.slug)
  const pending = save.isPending || supersede.isPending
  const title = supersedes
    ? `Supersede ${supersedes.ref}`
    : record
      ? `Edit ${record.ref}`
      : 'New decision'

  return (
    <form onSubmit={handleSubmit((v) => submit(v))} noValidate className="flex flex-col gap-4">
      <PageHeader
        title={title}
        breadcrumbs={securityCrumbs(
          { label: 'Decisions', href: securityPaths.decisions(org.slug) },
          ...(source ? [{ label: source.ref, href: cancelHref }] : []),
          { label: supersedes ? 'Supersede' : record ? 'Edit' : 'New' },
        )}
        description={
          supersedes ? (
            <>
              Write the decision that replaces <IdChip>{supersedes.ref}</IdChip>. The old one is
              kept as a record and marked superseded.
            </>
          ) : undefined
        }
        className="pb-0"
      />
      <FormError message={formError} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <FormField label="Title" error={errors.title?.message} required>
              <Input {...register('title')} autoComplete="off" />
            </FormField>
            <FormField
              label="Context"
              hint="The situation and forces that made a choice necessary."
              error={errors.context?.message}
              required
            >
              <Textarea {...register('context')} rows={5} />
            </FormField>
            <FormField
              label="Decision"
              hint="What was decided, in plain terms."
              error={errors.decision?.message}
              required
            >
              <Textarea {...register('decision')} rows={4} />
            </FormField>
            <FormField
              label="Consequences"
              hint="What becomes easier or harder, and what follows."
              error={errors.consequences?.message}
              required
            >
              <Textarea {...register('consequences')} rows={4} />
            </FormField>
          </CardContent>
        </Card>
        <Card className="h-fit lg:sticky lg:top-18">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {supersedes ? null : (
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <FormField id="adr-status" label="Status" required>
                    <Select
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as 'proposed' | 'accepted')}
                    >
                      <SelectTrigger id="adr-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="proposed">Proposed</SelectItem>
                        <SelectItem value="accepted">Accepted</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
              />
            )}
            <Controller
              control={control}
              name="decidedBy"
              render={({ field }) => (
                <FormField label="Decided by" error={errors.decidedBy?.message} required>
                  <PeoplePicker value={field.value} onChange={field.onChange} />
                </FormField>
              )}
            />
            <Controller
              control={control}
              name="decidedAt"
              render={({ field }) => (
                <FormField label="Date" error={errors.decidedAt?.message} required>
                  <DateField mode="date" value={field.value} onChange={field.onChange} />
                </FormField>
              )}
            />
            <Controller
              control={control}
              name="systemIds"
              render={({ field }) => (
                <FormField
                  id="adr-systems"
                  label="Systems it affects"
                  error={errors.systemIds?.message}
                >
                  <RecordMultiPicker
                    type="system"
                    id="adr-systems"
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormField>
              )}
            />
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button type="submit" variant="primary" disabled={pending}>
                {pending
                  ? 'Saving…'
                  : supersedes
                    ? 'Save and supersede'
                    : record
                      ? 'Save changes'
                      : 'Add decision'}
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
          pending={save.isPending}
          onOverwrite={() => {
            const latest = conflict.latest
            if (!latest) return
            setBaseVersion(latest.version)
            conflict.close()
            submit(getValues(), latest.version)
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
