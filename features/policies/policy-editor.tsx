'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangleIcon, HistoryIcon, InfoIcon } from 'lucide-react'
import {
  useCreateDocument,
  useDocumentLookup,
  useNextDocId,
  useUpdateDocument,
} from '@/lib/api/hooks/use-documents'
import { api, isApiError, orgPath } from '@/lib/api/client'
import { qk } from '@/lib/api/query-keys'
import type { DocumentDetail, DocumentLookupItem, ReviewCycleMonths } from '@/lib/api/types'
import { documentFormSchema, type DocumentFormValues } from '@/lib/schemas/documents'
import { formatRelative } from '@/lib/utils/dates'
import { toastError } from '@/lib/utils/toast-error'
import { useSession } from '@/components/providers/session-provider'
import { ConflictDialog, type ConflictTheirs } from '@/components/conflict-dialog'
import { ClassificationSelect } from '@/components/form/classification-select'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { PeoplePicker } from '@/components/form/people-picker'
import { MarkdownEditor } from '@/components/markdown/markdown-editor'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { policyPaths } from '@/features/policies/paths'
import type { PolicyTemplate } from '@/features/policies/templates'

const ROOT = '__root'

interface StoredDraft {
  title: string
  bodyMarkdown: string
  savedAt: string
}

function readDraft(key: string): StoredDraft | null {
  try {
    const raw = typeof sessionStorage === 'undefined' ? null : sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as StoredDraft) : null
  } catch {
    return null
  }
}

function clearDraft(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

/** Every page except `selfId` and its descendants (a page can't be its own parent). */
function parentOptions(items: DocumentLookupItem[], selfId?: string): DocumentLookupItem[] {
  if (!selfId) return items
  const excluded = new Set([selfId])
  let grew = true
  while (grew) {
    grew = false
    for (const it of items) {
      if (it.parentId && excluded.has(it.parentId) && !excluded.has(it.id)) {
        excluded.add(it.id)
        grew = true
      }
    }
  }
  return items.filter((i) => !excluded.has(i.id))
}

function SaveNotice({
  doc,
  requiresApproval,
}: {
  doc?: DocumentDetail
  requiresApproval: boolean
}) {
  if (!doc) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted">
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {requiresApproval
          ? 'Creates v1 as a draft. Submit it for review when it’s ready.'
          : 'Creates v1 and publishes it straight away (no approval needed).'}
      </p>
    )
  }
  const next = doc.currentVersion + 1
  if (!requiresApproval) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted">
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Saving publishes v{next} straight away. This page doesn’t need approval.
      </p>
    )
  }
  if (doc.status === 'approved') {
    return (
      <p className="flex items-start gap-2 text-sm text-warn" data-testid="save-warning">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-semibold">Saving returns this policy to Draft.</strong> Your
          changes become v{next}. v{doc.approvedVersion} stays the approved version until v{next} is
          approved.
        </span>
      </p>
    )
  }
  if (doc.status === 'in_review') {
    return (
      <p className="flex items-start gap-2 text-sm text-warn" data-testid="save-warning">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          <strong className="font-semibold">v{doc.currentVersion} is in review.</strong> Saving
          withdraws it from review and creates draft v{next}.
        </span>
      </p>
    )
  }
  return (
    <p className="flex items-start gap-2 text-sm text-muted">
      <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      Saving creates draft v{next}. Content changes always create a new version.
    </p>
  )
}

export function PolicyEditor({
  doc,
  template,
  defaultParentId = null,
}: {
  /** Edit mode when present; create mode otherwise. */
  doc?: DocumentDetail
  template?: PolicyTemplate
  defaultParentId?: string | null
}) {
  const { org, user } = useSession()
  const router = useRouter()
  const qc = useQueryClient()
  const lookup = useDocumentLookup(org.slug)
  const nextId = useNextDocId(org.slug, !doc)
  const create = useCreateDocument(org.slug)
  const update = useUpdateDocument(org.slug, doc?.id ?? '')
  const draftKey = `loopdox.draft.${org.slug}.${doc?.id ?? 'new'}`

  const initial = useMemo<DocumentFormValues>(
    () =>
      doc
        ? {
            docId: doc.docId,
            title: doc.title,
            parentId: doc.parentId,
            owner: doc.owner,
            reviewCycleMonths: doc.reviewCycleMonths,
            requiresApproval: doc.requiresApproval,
            classification: doc.classification,
            bodyMarkdown: doc.content?.bodyMarkdown ?? '',
            changeSummary: '',
          }
        : {
            docId: '',
            title: '',
            parentId: defaultParentId,
            owner: user.id,
            reviewCycleMonths: 12,
            requiresApproval: template?.requiresApproval ?? true,
            classification: 'internal',
            bodyMarkdown: template?.body ?? '',
            changeSummary: 'First draft.',
          },
    [doc, template, defaultParentId, user.id],
  )

  const form = useForm<DocumentFormValues>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: initial,
  })
  const { register, control, handleSubmit, setValue, getValues, setError, reset, formState } = form
  const [formError, setFormError] = useState<string | null>(null)
  const [baseVersion, setBaseVersion] = useState(doc?.version ?? 0)
  const [conflict, setConflict] = useState<{
    open: boolean
    theirs: ConflictTheirs | null
    latest: DocumentDetail | null
  }>({
    open: false,
    theirs: null,
    latest: null,
  })
  // Offer to restore an unsaved draft from this browser session (read once, on mount).
  const [restorable, setRestorable] = useState<StoredDraft | null>(() => {
    const d = readDraft(draftKey)
    return d && (d.bodyMarkdown !== initial.bodyMarkdown || d.title !== initial.title) ? d : null
  })

  // Suggested ID for new documents.
  useEffect(() => {
    if (!doc && nextId.data && !getValues('docId')) setValue('docId', nextId.data.docId)
  }, [doc, nextId.data, getValues, setValue])

  // Autosave title and body to sessionStorage only (never localStorage), cleared on save.
  const title = useWatch({ control, name: 'title' })
  const body = useWatch({ control, name: 'bodyMarkdown' })
  const requiresApproval = useWatch({ control, name: 'requiresApproval' })
  useEffect(() => {
    if (!formState.isDirty || restorable) return
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({ title, bodyMarkdown: body, savedAt: new Date().toISOString() }),
        )
      } catch {
        // Storage full or blocked: autosave is best effort.
      }
    }, 800)
    return () => clearTimeout(t)
  }, [title, body, draftKey, formState.isDirty, restorable])

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!formState.isDirty) return
    // Client-side navigation after a save doesn't fire this; only reloads and tab closes do.
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [formState.isDirty])

  const done = (saved: DocumentDetail, message: string) => {
    clearDraft(draftKey)
    toast.success(message)
    router.push(policyPaths.view(org.slug, saved.id))
  }

  const openConflict = async () => {
    setConflict({ open: true, theirs: null, latest: null })
    try {
      const latest = await api.get<DocumentDetail>(orgPath(org.slug, `/documents/${doc?.id ?? ''}`))
      qc.setQueryData(qk.documents.detail(org.slug, latest.id), latest)
      setConflict({
        open: true,
        latest,
        theirs: {
          version: latest.version,
          updatedByName: latest.updatedByName,
          updatedAt: latest.updatedAt,
          text: latest.content?.bodyMarkdown ?? '',
          label: `Saved v${latest.currentVersion}`,
        },
      })
    } catch (e) {
      setConflict({ open: false, theirs: null, latest: null })
      toastError(e)
    }
  }

  const save = (values: DocumentFormValues, ifVersion = baseVersion) => {
    setFormError(null)
    const onError = (e: unknown) => {
      if (isApiError(e) && e.isConflict && doc) {
        void openConflict()
        return
      }
      if (isApiError(e) && applyFieldErrors(e.fields, setError)) {
        setFormError('Some fields need attention.')
        return
      }
      setFormError(
        isApiError(e) ? e.message : 'Couldn’t save. Check your connection and try again.',
      )
    }
    if (!doc) {
      create.mutate(values, {
        onSuccess: (d) =>
          done(
            d,
            d.status === 'approved' ? `Published ${d.docId}` : `Created ${d.docId} as a draft`,
          ),
        onError,
      })
      return
    }
    update.mutate(
      { ...values, ifVersion },
      {
        onSuccess: (d) =>
          done(
            d,
            d.currentVersion > doc.currentVersion
              ? d.status === 'approved'
                ? `Published v${d.currentVersion}`
                : `Saved v${d.currentVersion} as a draft`
              : 'Saved the details',
          ),
        onError,
      },
    )
  }

  const submit = handleSubmit((values) => save(values))
  const submitRef = useRef(submit)
  useEffect(() => {
    submitRef.current = submit
  })
  const onEditorSave = useCallback(() => void submitRef.current(), [])

  // ⌘S anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void submitRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pending = create.isPending || update.isPending
  const parents = parentOptions(lookup.data ?? [], doc?.id)
  const errors = formState.errors
  const saveLabel = !doc
    ? requiresApproval
      ? 'Create draft'
      : 'Create and publish'
    : requiresApproval
      ? `Save as v${doc.currentVersion + 1}`
      : `Save and publish v${doc.currentVersion + 1}`
  const cancelHref = doc ? policyPaths.view(org.slug, doc.id) : policyPaths.library(org.slug)

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 pb-28">
      <PageHeader
        title={doc ? `Edit ${doc.docId}` : `New ${template?.name.toLowerCase() ?? 'page'}`}
        breadcrumbs={[
          { label: 'Policies', href: policyPaths.library(org.slug) },
          ...(doc ? [{ label: doc.docId, href: policyPaths.view(org.slug, doc.id) }] : []),
          { label: doc ? 'Edit' : 'New' },
        ]}
        className="pb-0"
      />

      {restorable ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-accent/30 bg-accent-soft px-4 py-3"
        >
          <HistoryIcon className="size-5 text-accent" aria-hidden="true" />
          <p className="flex-1 text-base">
            You have unsaved changes from {formatRelative(restorable.savedAt)} in this browser tab.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              clearDraft(draftKey)
              setRestorable(null)
            }}
          >
            Discard them
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => {
              setValue('title', restorable.title, { shouldDirty: true })
              setValue('bodyMarkdown', restorable.bodyMarkdown, { shouldDirty: true })
              setRestorable(null)
            }}
          >
            Restore unsaved changes
          </Button>
        </div>
      ) : null}

      <FormError message={formError} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <FormField label="Title" error={errors.title?.message} required>
            <Input {...register('title')} className="h-10 text-md font-medium" autoComplete="off" />
          </FormField>
          <div className="grid gap-1.5">
            <Label htmlFor="policy-body" id="policy-body-label">
              Page content
            </Label>
            <Controller
              control={control}
              name="bodyMarkdown"
              render={({ field, fieldState }) => (
                <MarkdownEditor
                  id="policy-body"
                  label="Page content"
                  value={field.value}
                  onChange={field.onChange}
                  onSave={onEditorSave}
                  lookup={lookup.data}
                  invalid={Boolean(fieldState.error)}
                />
              )}
            />
            {errors.bodyMarkdown ? (
              <p className="text-sm text-bad">{errors.bodyMarkdown.message}</p>
            ) : null}
          </div>
          <FormField
            label="Change summary"
            hint="Shown in the history. Say what changed and why, in a few words."
            error={errors.changeSummary?.message}
            required
          >
            <Input
              {...register('changeSummary')}
              autoComplete="off"
              placeholder="For example: require MFA for all accounts"
            />
          </FormField>
        </div>

        <Card className="h-fit lg:sticky lg:top-18">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <FormField
              label="Document ID"
              hint="A prefix and number, like ITD-017."
              error={errors.docId?.message}
              required
            >
              <Input
                {...register('docId')}
                className="font-mono uppercase"
                autoComplete="off"
                spellCheck={false}
              />
            </FormField>
            <Controller
              control={control}
              name="parentId"
              render={({ field }) => (
                <FormField
                  id="policy-parent"
                  label="Parent page"
                  hint="The section this page sits under."
                  error={errors.parentId?.message}
                >
                  <Select
                    value={field.value ?? ROOT}
                    onValueChange={(v) => field.onChange(v === ROOT ? null : v)}
                  >
                    <SelectTrigger id="policy-parent" aria-describedby="policy-parent-hint">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ROOT}>None (top level)</SelectItem>
                      {parents.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.docId} · {p.title}
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
            <Controller
              control={control}
              name="reviewCycleMonths"
              render={({ field }) => (
                <FormField
                  id="policy-cycle"
                  label="Review cycle"
                  error={errors.reviewCycleMonths?.message}
                >
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v) as ReviewCycleMonths)}
                  >
                    <SelectTrigger id="policy-cycle">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">Every 6 months</SelectItem>
                      <SelectItem value="12">Every 12 months</SelectItem>
                      <SelectItem value="24">Every 24 months</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            />
            <Controller
              control={control}
              name="classification"
              render={({ field }) => (
                <FormField label="Classification">
                  <ClassificationSelect value={field.value} onChange={field.onChange} />
                </FormField>
              )}
            />
            <Controller
              control={control}
              name="requiresApproval"
              render={({ field }) => (
                <div className="flex items-start justify-between gap-3">
                  <div className="grid gap-0.5">
                    <Label htmlFor="requires-approval">Requires approval</Label>
                    <p className="text-sm text-muted" id="requires-approval-hint">
                      Off for overview and section pages: saving publishes them.
                    </p>
                  </div>
                  <Switch
                    id="requires-approval"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-describedby="requires-approval-hint"
                  />
                </div>
              )}
            />
          </CardContent>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur lg:left-auto lg:w-[calc(100%-var(--sidebar-w,15rem))]">
        <div className="mx-auto flex max-w-content flex-wrap items-center gap-3 px-4 py-3 lg:px-8">
          <div className="min-w-60 flex-1">
            <SaveNotice doc={doc} requiresApproval={requiresApproval} />
          </div>
          <Button asChild variant="secondary">
            <Link href={cancelHref}>Cancel</Link>
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? 'Saving…' : saveLabel}
          </Button>
        </div>
      </div>

      {doc ? (
        <ConflictDialog
          open={conflict.open}
          onOpenChange={(o) => setConflict((c) => ({ ...c, open: o }))}
          theirs={conflict.theirs}
          mineText={body}
          pending={update.isPending}
          onOverwrite={() => {
            if (!conflict.latest) return
            setBaseVersion(conflict.latest.version)
            setConflict({ open: false, theirs: null, latest: null })
            save(getValues(), conflict.latest.version)
          }}
          onDiscard={() => {
            const latest = conflict.latest
            clearDraft(draftKey)
            setConflict({ open: false, theirs: null, latest: null })
            if (!latest) return
            setBaseVersion(latest.version)
            reset({
              docId: latest.docId,
              title: latest.title,
              parentId: latest.parentId,
              owner: latest.owner,
              reviewCycleMonths: latest.reviewCycleMonths,
              requiresApproval: latest.requiresApproval,
              classification: latest.classification,
              bodyMarkdown: latest.content?.bodyMarkdown ?? '',
              changeSummary: '',
            })
            toast.message(`Reloaded v${latest.currentVersion}. Your changes were discarded.`)
          }}
        />
      ) : null}
    </form>
  )
}
