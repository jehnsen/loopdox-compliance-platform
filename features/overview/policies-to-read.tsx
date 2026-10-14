'use client'

import Link from 'next/link'
import { useDocuments } from '@/lib/api/hooks/use-documents'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { policyPaths } from '@/features/policies/paths'

/** Staff overview: approved policies waiting for the user's acknowledgement. */
export function PoliciesToRead() {
  const org = useOrgSlug()
  const pending = useDocuments(org, { ack: ['pending'], pageSize: 5, sort: 'docId' })
  const total = pending.data?.total ?? 0
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Policies to read</CardTitle>
          <CardDescription>
            {pending.isLoading
              ? 'Checking…'
              : total
                ? `${total} approved ${total === 1 ? 'policy needs' : 'policies need'} your acknowledgement.`
                : 'You’re up to date with every approved policy.'}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pending.isLoading ? (
          <Skeleton className="h-16" />
        ) : total ? (
          <ul className="flex flex-col gap-2">
            {pending.data?.items.map((d) => (
              <li key={d.id} className="flex items-center gap-2">
                <IdChip>{d.docId}</IdChip>
                <Link
                  href={policyPaths.view(org, d.id)}
                  className="truncate hover:text-accent hover:underline"
                >
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <div>
          <Button asChild variant="secondary">
            <Link href={policyPaths.mine(org)}>Open My policies</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
