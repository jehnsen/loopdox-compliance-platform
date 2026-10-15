'use client'

import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import { CheckCircle2Icon, KeyRoundIcon, PlusIcon } from 'lucide-react'
import { isApiError } from '@/lib/api/client'
import { useAddKey, useDeleteKey, useKeys, useRotateKey } from '@/lib/api/hooks/use-ai'
import type { AiKeyProvider, AiKeyStorage, AiProviderKey } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { KEY_PROVIDER_LABELS, KEY_STORAGE_LABELS } from '@/lib/ai'
import { addKeySchema, keyMaterialIssues, type AddKeyValues } from '@/lib/schemas/ai'
import { toastError } from '@/lib/utils/toast-error'
import { useListParams } from '@/lib/utils/use-list-params'
import { useOrgSlug } from '@/components/providers/session-provider'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTable } from '@/components/data-table/data-table'
import { DateText } from '@/components/date-text'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PageHeader } from '@/components/page-header'
import { EmptyState } from '@/components/states'
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
import { aiCrumbs } from '@/features/ai-governance/shared'

const STORAGE_HINTS: Record<AiKeyStorage, string> = {
  fernet: 'VisorShield encrypts the key with its own key. Simplest to set up.',
  azure_key_vault: 'VisorShield keeps the key in your Azure Key Vault.',
  byok: 'You keep the key. LoopDox only records where it is.',
}

/** What the person sees once, after the key has gone. */
function Saved({ last4, label, onDone }: { last4: string; label: string; onDone: () => void }) {
  return (
    <div className="grid gap-4" data-testid="key-saved">
      <DialogHeader>
        <DialogTitle>Key saved</DialogTitle>
        <DialogDescription>
          {label} is ready to use, ending in <span className="font-mono">{last4}</span>.
        </DialogDescription>
      </DialogHeader>
      <p className="flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2 text-base">
        <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden="true" />
        LoopDox won’t show this key again, and can’t recover it. Keep your own copy somewhere safe.
      </p>
      <DialogFooter>
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  )
}

/** Add a key. The key is sent once; after that only its last four characters exist here. */
function AddKeyDialog({ onClose }: { onClose: () => void }) {
  const org = useOrgSlug()
  const add = useAddKey(org)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ last4: string; label: string } | null>(null)
  const form = useForm<AddKeyValues>({
    resolver: zodResolver(addKeySchema),
    defaultValues: {
      provider: 'anthropic',
      label: '',
      storage: 'fernet',
      key: '',
      reference: '',
      last4: '',
    },
  })
  const { register, control, handleSubmit, formState, setError: setFieldError } = form
  const storage = useWatch({ control, name: 'storage' })
  const errors = formState.errors

  const onValid = (v: AddKeyValues) => {
    setError(null)
    add.mutate(
      {
        provider: v.provider as AiKeyProvider,
        label: v.label,
        storage: v.storage,
        ...(v.storage === 'byok' ? { reference: v.reference, last4: v.last4 } : { key: v.key }),
      },
      {
        onSuccess: (k) => {
          // The key leaves the form and the mutation's memory as soon as it is saved.
          form.reset()
          add.reset()
          setSaved({ last4: k.last4, label: k.label })
        },
        onError: (e) => {
          if (isApiError(e) && applyFieldErrors(e.fields, setFieldError)) return
          setError(isApiError(e) ? e.message : 'Couldn’t save the key. Try again.')
        },
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !add.isPending && onClose()}>
      <DialogContent>
        {saved ? (
          <Saved last4={saved.last4} label={saved.label} onDone={onClose} />
        ) : (
          <form onSubmit={(e) => void handleSubmit(onValid)(e)} noValidate className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Add a provider key</DialogTitle>
              <DialogDescription>
                The key you add is shown to nobody afterwards, including you.
              </DialogDescription>
            </DialogHeader>
            <FormError message={error} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="provider"
                render={({ field }) => (
                  <FormField id="key-provider" label="Provider" required>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="key-provider">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(KEY_PROVIDER_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
              />
              <FormField label="Label" error={errors.label?.message} required>
                <Input
                  {...register('label')}
                  autoComplete="off"
                  placeholder="e.g. Anthropic: production"
                />
              </FormField>
            </div>
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Where the key is kept</legend>
              {(Object.keys(KEY_STORAGE_LABELS) as AiKeyStorage[]).map((s) => (
                <label key={s} className="flex items-start gap-2 text-base">
                  <input type="radio" value={s} className="mt-1" {...register('storage')} />
                  <span className="flex flex-col">
                    <span className="font-medium">{KEY_STORAGE_LABELS[s]}</span>
                    <span className="text-sm text-muted">{STORAGE_HINTS[s]}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {storage === 'byok' ? (
              <div className="grid gap-4" data-testid="byok">
                <p className="rounded-md bg-surface-2 px-3 py-2 text-base">
                  <span className="font-medium">How bring-your-own-key works.</span> Your key stays
                  in your own vault. You register it once: tell us where it lives and its last four
                  characters. VisorShield reads it from there when it calls the provider, and
                  LoopDox never receives it.
                </p>
                <FormField
                  label="Where it is kept"
                  hint="A vault URI or secret name."
                  error={errors.reference?.message}
                  required
                >
                  <Input
                    {...register('reference')}
                    autoComplete="off"
                    placeholder="https://your-vault.vault.azure.net/secrets/name"
                  />
                </FormField>
                <FormField label="Last 4 characters" error={errors.last4?.message} required>
                  <Input
                    {...register('last4')}
                    autoComplete="off"
                    maxLength={4}
                    className="w-28 font-mono"
                  />
                </FormField>
              </div>
            ) : (
              <FormField
                label="API key"
                hint="Paste it once. It goes straight to VisorShield’s key store."
                error={errors.key?.message}
                required
              >
                <Input
                  {...register('key')}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  data-1p-ignore
                />
              </FormField>
            )}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose} disabled={add.isPending}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={add.isPending}>
                {add.isPending ? 'Saving…' : 'Add key'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RotateKeyDialog({ k, onClose }: { k: AiProviderKey; onClose: () => void }) {
  const org = useOrgSlug()
  const rotate = useRotateKey(org, k.id)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ last4: string } | null>(null)
  const [key, setKey] = useState('')
  const [reference, setReference] = useState(k.reference ?? '')
  const [last4, setLast4] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const byok = k.storage === 'byok'

  const submit = () => {
    setError(null)
    const body = byok ? { reference, last4 } : { key }
    const issues = keyMaterialIssues(k.storage, body)
    if (issues.length) {
      setFields(Object.fromEntries(issues.map((i) => [i.path, i.message])))
      return
    }
    setFields({})
    rotate.mutate(body, {
      onSuccess: (r) => {
        setKey('')
        rotate.reset()
        setSaved({ last4: r.last4 })
      },
      onError: (e) => setError(isApiError(e) ? e.message : 'Couldn’t replace the key. Try again.'),
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !rotate.isPending && onClose()}>
      <DialogContent>
        {saved ? (
          <Saved last4={saved.last4} label={k.label} onDone={onClose} />
        ) : (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Replace {k.label}</DialogTitle>
              <DialogDescription>
                The old key stops being used as soon as the new one is saved. The new one is shown
                to nobody afterwards.
              </DialogDescription>
            </DialogHeader>
            <FormError message={error} />
            {byok ? (
              <>
                <FormField label="Where it is kept" error={fields.reference} required>
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    autoComplete="off"
                  />
                </FormField>
                <FormField label="Last 4 characters of the new key" error={fields.last4} required>
                  <Input
                    value={last4}
                    onChange={(e) => setLast4(e.target.value)}
                    autoComplete="off"
                    maxLength={4}
                    className="w-28 font-mono"
                  />
                </FormField>
              </>
            ) : (
              <FormField label="New API key" error={fields.key} required>
                <Input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  data-1p-ignore
                />
              </FormField>
            )}
            <DialogFooter>
              <Button variant="secondary" onClick={onClose} disabled={rotate.isPending}>
                Cancel
              </Button>
              <Button variant="primary" onClick={submit} disabled={rotate.isPending}>
                {rotate.isPending ? 'Saving…' : 'Replace key'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function KeyActions({ k }: { k: AiProviderKey }) {
  const org = useOrgSlug()
  const del = useDeleteKey(org, k.id)
  const [dialog, setDialog] = useState<'rotate' | 'delete' | null>(null)
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" onClick={() => setDialog('rotate')}>
        Replace<span className="sr-only"> {k.label}</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setDialog('delete')}>
        Delete<span className="sr-only"> {k.label}</span>
      </Button>
      {dialog === 'rotate' ? <RotateKeyDialog k={k} onClose={() => setDialog(null)} /> : null}
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Delete ${k.label}?`}
        description="Apps that call this provider through VisorShield stop working until another key is added. This can’t be undone."
        confirmLabel="Delete key"
        destructive
        typedConfirmation={k.label}
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(undefined, {
            onSuccess: () => {
              toast.success(`Deleted ${k.label}`)
              setDialog(null)
            },
            onError: (e) => {
              setDialog(null)
              toastError(e)
            },
          })
        }
      />
    </div>
  )
}

function useColumns(canEdit: boolean): ColumnDef<AiProviderKey>[] {
  return useMemo(() => {
    const cols: ColumnDef<AiProviderKey>[] = [
      {
        id: 'provider',
        header: 'Provider',
        meta: { label: 'Provider', sortKey: 'provider', alwaysVisible: true },
        cell: ({ row }) => KEY_PROVIDER_LABELS[row.original.provider],
      },
      {
        id: 'label',
        header: 'Label',
        meta: { label: 'Label', sortKey: 'label', alwaysVisible: true, className: 'min-w-48' },
        cell: ({ row }) => <span className="font-medium">{row.original.label}</span>,
      },
      {
        id: 'storage',
        header: 'Stored',
        meta: { label: 'Stored', sortKey: 'storage' },
        cell: ({ row }) => KEY_STORAGE_LABELS[row.original.storage],
      },
      {
        id: 'last4',
        header: 'Key',
        meta: { label: 'Key' },
        cell: ({ row }) => (
          <span className="font-mono" data-testid="key-last4">
            •••• {row.original.last4}
          </span>
        ),
      },
      {
        id: 'rotated',
        header: 'Last replaced',
        meta: { label: 'Last replaced', sortKey: 'rotatedAt' },
        cell: ({ row }) => (
          <DateText value={row.original.rotatedAt} className="whitespace-nowrap" />
        ),
      },
    ]
    if (canEdit) {
      cols.push({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { label: 'Actions', alwaysVisible: true, align: 'right' },
        cell: ({ row }) => <KeyActions k={row.original} />,
      })
    }
    return cols
  }, [canEdit])
}

export function KeysPage() {
  const org = useOrgSlug()
  const can = useCan()
  const [adding, setAdding] = useState(false)
  const { params, setParams, query } = useListParams({ filterKeys: [] })
  const list = useKeys(org, query)
  const canEdit = can('ai.edit')
  const columns = useColumns(canEdit)
  const add = canEdit ? (
    <Button variant="primary" onClick={() => setAdding(true)}>
      <PlusIcon aria-hidden="true" /> Add key
    </Button>
  ) : null

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Provider keys"
        breadcrumbs={aiCrumbs({ label: 'Provider keys' })}
        description="The keys VisorShield uses to call AI providers for you."
        actions={add}
      />
      <p
        className="mb-4 rounded-md border border-line bg-surface px-4 py-3 text-base"
        data-testid="key-notice"
      >
        LoopDox never shows a key after it is added. Only the last four characters are kept, so you
        can tell keys apart.
      </p>
      {adding ? <AddKeyDialog onClose={() => setAdding(false)} /> : null}
      <DataTable
        label="Provider keys"
        columns={columns}
        data={list.data}
        isLoading={list.isLoading}
        isFetching={list.isFetching}
        isError={list.isError}
        error={list.error}
        onRetry={() => void list.refetch()}
        params={params}
        setParams={setParams}
        query={query}
        getRowId={(k) => k.id}
        searchPlaceholder="Search by provider or label"
        emptyState={
          <EmptyState
            icon={KeyRoundIcon}
            title="No provider keys yet"
            body="Add the key for each AI provider VisorShield should call. You will see it once, when you add it."
            actions={add}
          />
        }
      />
    </div>
  )
}
