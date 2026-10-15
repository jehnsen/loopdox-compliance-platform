'use client'

import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useSaveGrant, useSystems } from '@/lib/api/hooks/use-security'
import { isApiError } from '@/lib/api/client'
import type { AccessGrantSummary, AccessLevel } from '@/lib/api/types'
import { grantFormSchema, type GrantFormValues } from '@/lib/schemas/security'
import { ACCESS_LEVEL_LABELS, ACCESS_LEVELS } from '@/lib/security'
import { todayInTz } from '@/lib/utils/dates'
import { useSession } from '@/components/providers/session-provider'
import { DateField } from '@/components/form/date-field'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PeoplePicker } from '@/components/form/people-picker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

/** Add a grant, or change an existing one's level, approver, date and notes. */
export function GrantDialog({
  grant,
  presetSystemId,
  onClose,
}: {
  grant: AccessGrantSummary | null
  presetSystemId?: string
  onClose: () => void
}) {
  const { org, user } = useSession()
  const save = useSaveGrant(org.slug)
  const systems = useSystems(org.slug, { pageSize: 200, sort: 'name' })
  const [error, setError] = useState<string | null>(null)
  const [external, setExternal] = useState(Boolean(grant?.externalName))
  const form = useForm<GrantFormValues>({
    resolver: zodResolver(grantFormSchema),
    defaultValues: grant
      ? {
          systemId: grant.systemId,
          userId: grant.userId,
          externalName: grant.externalName,
          level: grant.level,
          approvedBy: grant.approvedBy,
          grantedAt: grant.grantedAt,
          notes: grant.notes,
        }
      : {
          systemId: presetSystemId ?? '',
          userId: null,
          externalName: null,
          level: 'read',
          approvedBy: user.id,
          grantedAt: todayInTz(org.timezone),
          notes: '',
        },
  })
  const { control, register, handleSubmit, formState, setValue, setError: setFieldError } = form
  const errors = formState.errors

  const submit = handleSubmit((v) =>
    save.mutate(
      { ...v, ...(grant ? { id: grant.id, ifVersion: grant.version } : {}) },
      {
        onSuccess: () => {
          toast.success(grant ? 'Access updated' : 'Access added')
          onClose()
        },
        onError: (e) => {
          if (isApiError(e) && e.isConflict) {
            setError('Someone changed this grant. Close this window and open it again.')
            return
          }
          if (isApiError(e) && applyFieldErrors(e.fields, setFieldError)) return
          setError(isApiError(e) ? e.message : 'Couldn’t save. Try again.')
        },
      },
    ),
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{grant ? 'Edit access' : 'Add access'}</DialogTitle>
            <DialogDescription>
              {grant
                ? `${grant.personName} on ${grant.systemName}. To move access to another system or person, revoke it and add a new grant.`
                : 'Record who can reach a system, at what level, and who approved it.'}
            </DialogDescription>
          </DialogHeader>
          <FormError message={error} />
          <Controller
            control={control}
            name="systemId"
            render={({ field }) => (
              <FormField id="grant-system" label="System" error={errors.systemId?.message} required>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={Boolean(grant)}
                >
                  <SelectTrigger id="grant-system">
                    <SelectValue placeholder="Choose a system" />
                  </SelectTrigger>
                  <SelectContent>
                    {(systems.data?.items ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          />
          {grant ? null : (
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Who</legend>
              <div className="flex gap-4 text-base">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="who"
                    checked={!external}
                    onChange={() => {
                      setExternal(false)
                      setValue('externalName', null)
                    }}
                  />
                  A member
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="who"
                    checked={external}
                    onChange={() => {
                      setExternal(true)
                      setValue('userId', null)
                    }}
                  />
                  Someone outside the organisation
                </label>
              </div>
              {external ? (
                <FormField label="Name" error={errors.userId?.message} required>
                  <Input
                    {...register('externalName', { setValueAs: (v: string) => v || null })}
                    placeholder="e.g. Ramil Torres (contractor)"
                    autoComplete="off"
                  />
                </FormField>
              ) : (
                <Controller
                  control={control}
                  name="userId"
                  render={({ field }) => (
                    <FormField label="Member" error={errors.userId?.message} required>
                      <PeoplePicker value={field.value} onChange={field.onChange} />
                    </FormField>
                  )}
                />
              )}
            </fieldset>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="level"
              render={({ field }) => (
                <FormField id="grant-level" label="Level" required>
                  <Select
                    value={field.value}
                    onValueChange={(v) => field.onChange(v as AccessLevel)}
                  >
                    <SelectTrigger id="grant-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCESS_LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>
                          {ACCESS_LEVEL_LABELS[l]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            />
            <Controller
              control={control}
              name="grantedAt"
              render={({ field }) => (
                <FormField label="Granted on" error={errors.grantedAt?.message} required>
                  <DateField mode="date" value={field.value} onChange={field.onChange} />
                </FormField>
              )}
            />
          </div>
          <Controller
            control={control}
            name="approvedBy"
            render={({ field }) => (
              <FormField label="Approved by" error={errors.approvedBy?.message} required>
                <PeoplePicker value={field.value} onChange={field.onChange} />
              </FormField>
            )}
          />
          <FormField label="Notes" error={errors.notes?.message}>
            <Textarea {...register('notes')} rows={2} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : grant ? 'Save changes' : 'Add access'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
