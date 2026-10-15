'use client'

import { Loader2Icon, PlayIcon } from 'lucide-react'
import { toast } from 'sonner'
import { isApiError } from '@/lib/api/client'
import { useRunConnector } from '@/lib/api/hooks/use-evidence'
import type { ConnectorProvider, ConnectorStatus } from '@/lib/api/types'
import { PROVIDERS } from '@/lib/evidence'
import { useOrgSlug } from '@/components/providers/session-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface RunnableConnector {
  id: string
  provider: ConnectorProvider
  status: ConnectorStatus
}

/** Runs a connector now and says what happened. */
export function useRunNow() {
  const org = useOrgSlug()
  const run = useRunConnector(org)
  return {
    pendingId: run.isPending ? run.variables : null,
    runNow: (c: RunnableConnector) => {
      const name = PROVIDERS[c.provider].name
      run.mutate(c.id, {
        onSuccess: (result) => {
          if (!result.ok) {
            toast.error(
              `${name} couldn’t be reached. ${result.connector.lastError?.message ?? ''}`.trim(),
            )
            return
          }
          const failed = result.evidence.filter((e) => e.result === 'fail').length
          toast.success(
            `${name} checked: ${result.evidence.length} ${result.evidence.length === 1 ? 'check' : 'checks'} recorded${failed ? `, ${failed} failed` : ', all passed'}`,
          )
        },
        onError: (e) => toast.error(isApiError(e) ? e.message : `Couldn’t run ${name}. Try again.`),
      })
    },
  }
}

/** "Run now" for one connector. */
export function RunNowButton({
  connector,
  label = 'Run now',
}: {
  connector: RunnableConnector
  label?: string
}) {
  const { runNow, pendingId } = useRunNow()
  const pending = pendingId === connector.id
  const name = PROVIDERS[connector.provider].name
  return (
    <Button
      variant="secondary"
      disabled={pending || connector.status === 'disconnected'}
      onClick={() => runNow(connector)}
      aria-label={`${label} for ${name}`}
    >
      {pending ? (
        <Loader2Icon className="animate-spin" aria-hidden="true" />
      ) : (
        <PlayIcon aria-hidden="true" />
      )}
      {pending ? 'Running…' : label}
    </Button>
  )
}

/**
 * "Run connector now" on a control: one button when a single connector feeds it, a menu
 * when several do.
 */
export function RunControlConnectors({ connectors }: { connectors: RunnableConnector[] }) {
  const { runNow, pendingId } = useRunNow()
  if (!connectors.length) return null
  const only = connectors[0]
  if (connectors.length === 1 && only) {
    return (
      <Button
        variant="secondary"
        disabled={pendingId === only.id || only.status === 'disconnected'}
        onClick={() => runNow(only)}
      >
        {pendingId === only.id ? (
          <Loader2Icon className="animate-spin" aria-hidden="true" />
        ) : (
          <PlayIcon aria-hidden="true" />
        )}
        {pendingId === only.id ? 'Running…' : 'Run connector now'}
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" disabled={Boolean(pendingId)}>
          <PlayIcon aria-hidden="true" /> Run connector now
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {connectors.map((c) => (
          <DropdownMenuItem
            key={c.id}
            disabled={c.status === 'disconnected'}
            onSelect={() => runNow(c)}
          >
            {PROVIDERS[c.provider].name}
            {c.status === 'disconnected' ? ' (not connected)' : ''}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
