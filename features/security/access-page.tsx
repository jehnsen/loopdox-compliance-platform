'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ClipboardCheckIcon, PencilIcon, PlusIcon, UserCheckIcon, UserXIcon } from 'lucide-react'
import { useGrants, useRevokeGrant } from '@/lib/api/hooks/use-security'
import type { AccessGrantSummary } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { ACCESS_LEVEL_LABELS, ACCESS_LEVELS } from '@/lib/security'
import { cn } from '@/lib/utils/cn'
import { plural } from '@/lib/utils/format'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { CalendarDate } from '@/components/date-text'
import { PageHeader } from '@/components/page-header'
import { EmptyState, ErrorState } from '@/components/states'
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
import { Skeleton } from '@/components/ui/skeleton'
import { GrantDialog } from '@/features/security/grant-dialog'
import { securityPaths } from '@/features/security/paths'
import { AccessLevelBadge, securityCrumbs } from '@/features/security/shared'

type View = 'system' | 'person'
const ALL = '__all__'

interface Group {
  key: string
  title: string
  subtitle?: string
  ref?: string
  href?: string
  grants: AccessGrantSummary[]
}

function groupGrants(grants: AccessGrantSummary[], view: View, org: string): Group[] {
  const map = new Map<string, Group>()
  for (const g of grants) {
    const key = view === 'system' ? g.systemId : g.personKey
    let group = map.get(key)
    if (!group) {
      group =
        view === 'system'
          ? {
              key,
              title: g.systemName,
              ref: g.systemRef,
              href: securityPaths.systemView(org, g.systemId),
              grants: [],
            }
          : {
              key,
              title: g.personName,
              subtitle: g.externalName ? 'Outside the organisation' : 'Member',
              grants: [],
            }
      map.set(key, group)
    }
    group.grants.push(g)
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title))
}

function GrantTable({
  grants,
  view,
  org,
  onEdit,
  onRevoke,
  canEdit,
}: {
  grants: AccessGrantSummary[]
  view: View
  org: string
  onEdit: (g: AccessGrantSummary) => void
  onRevoke: (g: AccessGrantSummary) => void
  canEdit: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-136 text-left text-base">
        <thead>
          <tr className="border-y border-line text-sm text-muted">
            <th scope="col" className="px-4 py-2 font-medium">
              {view === 'system' ? 'Person' : 'System'}
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Level
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Approved by
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Granted
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              Last reviewed
            </th>
            {canEdit ? (
              <th scope="col" className="px-4 py-2 text-right font-medium">
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {grants.map((g) => (
            <tr key={g.id} className="border-b border-line last:border-b-0" data-testid="grant-row">
              <td className="px-4 py-2">
                {view === 'system' ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{g.personName}</span>
                    {g.externalName ? (
                      <span className="rounded-sm border border-line px-1 text-2xs text-muted uppercase">
                        External
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <Link
                    href={securityPaths.systemView(org, g.systemId)}
                    className="font-medium hover:text-accent hover:underline"
                  >
                    {g.systemName}
                  </Link>
                )}
              </td>
              <td className="px-4 py-2">
                <AccessLevelBadge level={g.level} />
              </td>
              <td className="px-4 py-2 whitespace-nowrap">{g.approvedByName}</td>
              <td className="px-4 py-2 whitespace-nowrap">
                <CalendarDate value={g.grantedAt} />
              </td>
              <td className="px-4 py-2 whitespace-nowrap">
                {g.lastReviewedAt ? (
                  <CalendarDate value={g.lastReviewedAt} />
                ) : (
                  <span className="text-warn">Never</span>
                )}
              </td>
              {canEdit ? (
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onEdit(g)}
                    aria-label={`Edit ${g.personName} on ${g.systemName}`}
                  >
                    <PencilIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onRevoke(g)}
                    aria-label={`Revoke ${g.personName} on ${g.systemName}`}
                  >
                    <UserXIcon />
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Who has access to what: grouped by system ("who has access to X") or by person ("what can Y access"). */
export function AccessPage() {
  const org = useOrgSlug()
  const can = useCan()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const view: View = params.get('view') === 'person' ? 'person' : 'system'
  const systemFilter = params.get('system') ?? ''
  const personFilter = params.get('person') ?? ''
  const levelFilter = params.get('level') ?? ''
  const q = params.get('q') ?? ''
  const edit = can('security.edit')

  const list = useGrants(org, { pageSize: 200 })
  const revoke = useRevokeGrant(org)
  const [dialog, setDialog] = useState<{ grant: AccessGrantSummary | null } | null>(null)
  const [revoking, setRevoking] = useState<AccessGrantSummary | null>(null)

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const all = useMemo(() => list.data?.items ?? [], [list.data])
  const systems = useMemo(
    () =>
      [...new Map(all.map((g) => [g.systemId, g.systemName])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [all],
  )
  const people = useMemo(
    () =>
      [...new Map(all.map((g) => [g.personKey, g.personName])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [all],
  )
  const term = q.trim().toLowerCase()
  const shown = all.filter(
    (g) =>
      (!systemFilter || g.systemId === systemFilter) &&
      (!personFilter || g.personKey === personFilter) &&
      (!levelFilter || g.level === levelFilter) &&
      (!term || `${g.personName} ${g.systemName}`.toLowerCase().includes(term)),
  )
  const groups = groupGrants(shown, view, org)
  const filtered = Boolean(systemFilter || personFilter || levelFilter || term)

  const addButton = edit ? (
    <Button variant="primary" onClick={() => setDialog({ grant: null })}>
      <PlusIcon aria-hidden="true" /> Add access
    </Button>
  ) : null

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Access grants"
        breadcrumbs={securityCrumbs({ label: 'Access grants' })}
        description="Who can reach which system, at what level, and who approved it. Reviewed every quarter."
        actions={
          <>
            <Button asChild variant="secondary">
              <Link href={securityPaths.reviews(org)}>
                <ClipboardCheckIcon aria-hidden="true" /> Access reviews
              </Link>
            </Button>
            {addButton}
          </>
        }
        className="pb-0"
      />

      <div className="flex flex-wrap items-end gap-3">
        <div
          role="group"
          aria-label="Group by"
          className="flex rounded-md border border-line p-0.5"
        >
          {(['system', 'person'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setParam({ view: v === 'system' ? null : v })}
              className={cn(
                'h-7 rounded-sm px-3 text-sm',
                view === v ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:text-fg',
              )}
            >
              By {v}
            </button>
          ))}
        </div>
        {view === 'system' ? (
          <div className="grid gap-1">
            <Label htmlFor="access-system" className="text-xs text-muted">
              Who has access to…
            </Label>
            <Select
              value={systemFilter || ALL}
              onValueChange={(v) => setParam({ system: v === ALL ? null : v })}
            >
              <SelectTrigger id="access-system" className="w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Every system</SelectItem>
                {systems.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="grid gap-1">
            <Label htmlFor="access-person" className="text-xs text-muted">
              What can… access
            </Label>
            <Select
              value={personFilter || ALL}
              onValueChange={(v) => setParam({ person: v === ALL ? null : v })}
            >
              <SelectTrigger id="access-person" className="w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Everyone</SelectItem>
                {people.map(([key, name]) => (
                  <SelectItem key={key} value={key}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-1">
          <Label htmlFor="access-level" className="text-xs text-muted">
            Level
          </Label>
          <Select
            value={levelFilter || ALL}
            onValueChange={(v) => setParam({ level: v === ALL ? null : v })}
          >
            <SelectTrigger id="access-level" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any level</SelectItem>
              {ACCESS_LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {ACCESS_LEVEL_LABELS[l]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="access-q" className="text-xs text-muted">
            Search
          </Label>
          <Input
            id="access-q"
            type="search"
            defaultValue={q}
            onChange={(e) => setParam({ q: e.target.value.trim() || null })}
            placeholder="Person or system"
            className="w-52 placeholder:text-muted"
            autoComplete="off"
          />
        </div>
        {filtered ? (
          <Button
            variant="link"
            size="sm"
            onClick={() => setParam({ system: null, person: null, level: null, q: null })}
          >
            Clear filters
          </Button>
        ) : null}
      </div>

      <p role="status" className="text-sm text-muted">
        {list.data
          ? `${plural(shown.length, 'active grant')} across ${plural(groups.length, view === 'system' ? 'system' : 'person', view === 'system' ? 'systems' : 'people')}.`
          : ''}
      </p>

      {list.isLoading ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : !groups.length ? (
        <EmptyState
          icon={UserCheckIcon}
          title={filtered ? 'No access matches these filters' : 'No access recorded yet'}
          body={
            filtered
              ? 'Clear a filter or search for something else.'
              : 'Add each person who can reach a system. Quarterly reviews start from this list.'
          }
          actions={filtered ? null : addButton}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <Card key={group.key} data-testid={`access-group-${group.key}`}>
              <CardHeader className="items-center">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {group.ref ? <IdChip>{group.ref}</IdChip> : null}
                  {group.href ? (
                    <Link href={group.href} className="hover:text-accent hover:underline">
                      {group.title}
                    </Link>
                  ) : (
                    group.title
                  )}
                  {group.subtitle ? (
                    <span className="text-sm font-normal text-muted">{group.subtitle}</span>
                  ) : null}
                </CardTitle>
                <span className="text-sm text-muted tabular-nums">
                  {plural(group.grants.length, 'grant')}
                </span>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <GrantTable
                  grants={group.grants}
                  view={view}
                  org={org}
                  canEdit={edit}
                  onEdit={(g) => setDialog({ grant: g })}
                  onRevoke={setRevoking}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dialog ? (
        <GrantDialog
          grant={dialog.grant}
          presetSystemId={systemFilter || undefined}
          onClose={() => setDialog(null)}
        />
      ) : null}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revoke this access?"
        description={
          revoking
            ? `${revoking.personName} will no longer have ${ACCESS_LEVEL_LABELS[revoking.level].toLowerCase()} access to ${revoking.systemName}. Remove the access in the system itself too; LoopDox only records it.`
            : ''
        }
        confirmLabel="Revoke access"
        destructive
        pending={revoke.isPending}
        onConfirm={() => {
          if (!revoking) return
          revoke.mutate(
            { id: revoking.id, ifVersion: revoking.version },
            {
              onSuccess: () => {
                toast.success(`Revoked ${revoking.personName} on ${revoking.systemName}`)
                setRevoking(null)
              },
              onError: (e) => {
                setRevoking(null)
                toastError(e)
              },
            },
          )
        }}
      />
    </div>
  )
}
