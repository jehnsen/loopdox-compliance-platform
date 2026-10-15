'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  CloudIcon,
  GitBranchIcon,
  PlugIcon,
  ServerIcon,
  UsersRoundIcon,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { isApiError } from '@/lib/api/client'
import { useConnectors, useUpdateConnector } from '@/lib/api/hooks/use-evidence'
import type { Connector, ConnectorProvider } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { PROVIDERS } from '@/lib/evidence'
import { connectorFormSchema, type ConnectorFormValues } from '@/lib/schemas/evidence'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DateText } from '@/components/date-text'
import { applyFieldErrors, FormError, FormField } from '@/components/form/form-field'
import { useOrgSlug } from '@/components/providers/session-provider'
import { PageHeader } from '@/components/page-header'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { evidenceCrumbs, evidencePaths } from '@/features/evidence/shared'
import { RunNowButton } from '@/features/evidence/run-connector'

const ICONS: Record<ConnectorProvider, LucideIcon> = {
  github: GitBranchIcon,
  azure: CloudIcon,
  google_workspace: UsersRoundIcon,
  hostinger: ServerIcon,
}

/**
 * Connect or reconfigure. Mock mode simulates the provider's sign-in and succeeds; the
 * real flow sends the person to the provider and LoopDox keeps only the grant it gets
 * back, never a password, token or key.
 */
function ConnectDialog({ connector, onClose }: { connector: Connector; onClose: () => void }) {
  const org = useOrgSlug()
  const info = PROVIDERS[connector.provider]
  const update = useUpdateConnector(org, connector.id)
  const [error, setError] = useState<string | null>(null)
  const reconfiguring = connector.status !== 'disconnected'
  const form = useForm<ConnectorFormValues>({
    resolver: zodResolver(connectorFormSchema),
    defaultValues: { account: connector.account ?? '' },
  })
  const { register, handleSubmit, formState, setError: setFieldError } = form

  const submit = handleSubmit((values) =>
    update.mutate(
      { ifVersion: connector.version, status: 'connected', account: values.account },
      {
        onSuccess: () => {
          toast.success(
            reconfiguring
              ? `${info.name} reconnected`
              : `${info.name} connected. Run it to collect evidence.`,
          )
          onClose()
        },
        onError: (e) => {
          if (isApiError(e) && e.isConflict) {
            setError('Someone changed this connector. Close this window and open it again.')
            return
          }
          if (isApiError(e) && applyFieldErrors(e.fields, setFieldError)) return
          setError(isApiError(e) ? e.message : 'Couldn’t connect. Try again.')
        },
      },
    ),
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {reconfiguring ? `Reconfigure ${info.name}` : `Connect ${info.name}`}
            </DialogTitle>
            <DialogDescription>
              LoopDox reads settings from {info.name} to collect evidence. It never takes a
              password, token or key in this form.
            </DialogDescription>
          </DialogHeader>
          <FormError message={error} />
          <FormField
            label={info.accountLabel}
            hint={`For example ${info.accountExample}.`}
            error={formState.errors.account?.message}
            required
          >
            <Input {...register('account')} autoComplete="off" />
          </FormField>
          <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-muted">
            In this demo, connecting simulates the sign-in on {info.name}’s own page and succeeds.
          </p>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={update.isPending}>
              {reconfiguring ? 'Reconnect' : `Connect ${info.name}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CheckRow({ check, org }: { check: Connector['checks'][number]; org: string }) {
  const Icon =
    check.lastResult === 'pass'
      ? CircleCheckIcon
      : check.lastResult === 'fail'
        ? CircleXIcon
        : CircleDashedIcon
  const tone =
    check.lastResult === 'pass'
      ? 'text-ok'
      : check.lastResult === 'fail'
        ? 'text-bad'
        : 'text-muted'
  const word =
    check.lastResult === 'pass' ? 'Passed' : check.lastResult === 'fail' ? 'Failed' : 'Not run yet'
  return (
    <li className="flex items-start gap-2" data-testid="connector-check">
      <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden="true" />
      <div className="flex min-w-0 flex-col">
        <span>
          <span className="font-medium">{word}.</span> {check.name}{' '}
          <Link
            href={`${evidencePaths.controls(org)}/${check.controlId}`}
            className="font-mono text-xs text-accent hover:underline"
          >
            {check.controlReference}
          </Link>
        </span>
        {check.detail ? <span className="text-sm text-muted">{check.detail}</span> : null}
      </div>
    </li>
  )
}

function ConnectorCard({ connector }: { connector: Connector }) {
  const org = useOrgSlug()
  const can = useCan()
  const info = PROVIDERS[connector.provider]
  const Icon = ICONS[connector.provider]
  const [dialog, setDialog] = useState<'connect' | 'disconnect' | null>(null)
  const update = useUpdateConnector(org, connector.id)
  const canEdit = can('evidence.edit')
  const connected = connector.status !== 'disconnected'

  const disconnect = () =>
    update.mutate(
      { ifVersion: connector.version, status: 'disconnected' },
      {
        onSuccess: () => {
          toast.success(`${info.name} disconnected. Its past evidence stays.`)
          setDialog(null)
        },
        onError: (e) => toast.error(isApiError(e) ? e.message : 'Couldn’t disconnect. Try again.'),
      },
    )

  return (
    <Card data-testid="connector-card" data-provider={connector.provider}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-2">
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="text-md font-semibold">{info.name}</h2>
            <p className="text-sm text-muted">{info.description}</p>
          </div>
          <StatusPill status={connector.status} />
        </div>

        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <dt className="label-caps">Account</dt>
            <dd className="truncate">
              {connector.account ?? <span className="text-muted">None</span>}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="label-caps">Last run</dt>
            <dd>
              {connector.lastRunAt ? (
                <DateText value={connector.lastRunAt} relative />
              ) : (
                <span className="text-muted">Never</span>
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="label-caps">Runs</dt>
            <dd>{connected ? info.schedule : <span className="text-muted">Not scheduled</span>}</dd>
          </div>
        </dl>

        {connector.lastError ? (
          <div
            className="flex flex-col gap-1 rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-base"
            data-testid="connector-error"
          >
            <p className="font-medium">The last run failed</p>
            <p>{connector.lastError.message}</p>
            <p>
              <span className="font-medium">How to fix it:</span> {connector.lastError.fixHint}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <h3 className="label-caps">
            {connected ? 'Checks it performs' : 'Checks it will perform'}
          </h3>
          <ul className="flex flex-col gap-2">
            {connector.checks.map((c) => (
              <CheckRow key={c.id} check={c} org={org} />
            ))}
          </ul>
        </div>

        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            {connected ? (
              <>
                <RunNowButton connector={connector} />
                <Button variant="secondary" onClick={() => setDialog('connect')}>
                  Reconfigure
                  <span className="sr-only"> {info.name}</span>
                </Button>
                <Button variant="ghost" onClick={() => setDialog('disconnect')}>
                  Disconnect
                  <span className="sr-only"> {info.name}</span>
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => setDialog('connect')}>
                Connect
                <span className="sr-only"> {info.name}</span>
              </Button>
            )}
          </div>
        ) : null}

        {dialog === 'connect' ? (
          <ConnectDialog connector={connector} onClose={() => setDialog(null)} />
        ) : null}
        <ConfirmDialog
          open={dialog === 'disconnect'}
          onOpenChange={(o) => !o && setDialog(null)}
          title={`Disconnect ${info.name}?`}
          description="LoopDox stops collecting evidence from it. The evidence already collected stays on its controls."
          confirmLabel="Disconnect"
          destructive
          pending={update.isPending}
          onConfirm={disconnect}
        />
      </CardContent>
    </Card>
  )
}

export function ConnectorsPage() {
  const org = useOrgSlug()
  const list = useConnectors(org)
  const items = list.data?.items ?? []

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Connectors"
        breadcrumbs={evidenceCrumbs({ label: 'Connectors' })}
        description="Systems LoopDox checks on a schedule. Each check is recorded as evidence on the control it supports."
      />
      {list.isLoading ? (
        <div className="grid gap-4 xl:grid-cols-2" aria-busy="true">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      ) : list.isError ? (
        <ErrorState title="Couldn’t load connectors" onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={PlugIcon}
          title="No connectors available"
          body="Connectors for GitHub, Azure, Google Workspace and Hostinger appear here."
        />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {items.map((c) => (
            <ConnectorCard key={c.id} connector={c} />
          ))}
        </div>
      )}
    </div>
  )
}
