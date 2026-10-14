'use client'

import Link from 'next/link'
import { toast } from 'sonner'
import { BookOpenCheckIcon, CheckCircle2Icon } from 'lucide-react'
import { useAcknowledge } from '@/lib/api/hooks/use-documents'
import type { DocumentDetail } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { toastError } from '@/lib/utils/toast-error'
import { useOrgSlug } from '@/components/providers/session-provider'
import { DateText } from '@/components/date-text'
import { Button } from '@/components/ui/button'
import { policyPaths } from '@/features/policies/paths'

/**
 * Shown at the end of a policy: "I have read and understood this policy".
 * Acknowledgement is always for the approved version.
 */
export function AcknowledgeCard({
  doc,
  viewingVersion,
}: {
  doc: DocumentDetail
  viewingVersion: number
}) {
  const org = useOrgSlug()
  const can = useCan()
  const ack = useAcknowledge(org, doc.id)
  if (
    !can('policies.acknowledge') ||
    !doc.requiresApproval ||
    doc.approvedVersion === null ||
    doc.status === 'retired'
  ) {
    return null
  }
  if (doc.acknowledgedByMe) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-ok/30 bg-ok-soft px-4 py-3 text-base"
        role="status"
      >
        <CheckCircle2Icon className="size-5 shrink-0 text-ok" aria-hidden="true" />
        <span>
          You acknowledged v{doc.approvedVersion}{' '}
          {doc.acknowledgedAt ? <DateText value={doc.acknowledgedAt} relative /> : null}.
        </span>
      </div>
    )
  }
  if (viewingVersion !== doc.approvedVersion) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-base">
        <BookOpenCheckIcon className="size-5 shrink-0 text-muted" aria-hidden="true" />
        <span className="flex-1">
          You haven’t acknowledged the approved version (v{doc.approvedVersion}) yet.
        </span>
        <Button asChild variant="secondary" size="sm">
          <Link href={policyPaths.version(org, doc.id, doc.approvedVersion)}>
            Read v{doc.approvedVersion}
          </Link>
        </Button>
      </div>
    )
  }
  return (
    <section
      aria-labelledby="ack-heading"
      className="flex flex-col gap-3 rounded-lg border border-accent/40 bg-accent-soft px-5 py-4"
    >
      <h2 id="ack-heading" className="text-md font-semibold">
        Confirm you’ve read this policy
      </h2>
      <p className="text-base">
        Your acknowledgement of {doc.docId} v{doc.approvedVersion} is recorded with today’s date.
      </p>
      <div>
        <Button
          variant="primary"
          disabled={ack.isPending}
          onClick={() =>
            ack.mutate(undefined, {
              onSuccess: () => toast.success(`Acknowledged ${doc.docId} v${doc.approvedVersion}`),
              onError: (e) => toastError(e),
            })
          }
        >
          <BookOpenCheckIcon aria-hidden="true" />I have read and understood this policy
        </Button>
      </div>
    </section>
  )
}
