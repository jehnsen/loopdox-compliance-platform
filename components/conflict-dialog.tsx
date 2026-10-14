'use client'

import { useState } from 'react'
import { LazyDiffView } from '@/components/diff-view-lazy'
import { DateText } from '@/components/date-text'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'

export interface ConflictTheirs {
  version: number
  updatedByName: string
  updatedAt: string
  text: string
  label: string
}

/**
 * 409 handler: "Someone changed this." Lets the user compare their edit with the
 * latest saved version, then overwrite or discard their changes.
 */
export function ConflictDialog({
  open,
  onOpenChange,
  theirs,
  mineText,
  onOverwrite,
  onDiscard,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null while the latest version is loading. */
  theirs: ConflictTheirs | null
  mineText: string
  onOverwrite: () => void
  onDiscard: () => void
  pending?: boolean
}) {
  const [reviewing, setReviewing] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReviewing(false)
        onOpenChange(o)
      }}
    >
      <DialogContent className={reviewing ? 'max-w-5xl' : undefined}>
        <DialogHeader>
          <DialogTitle>Someone changed this</DialogTitle>
          <DialogDescription>
            {theirs ? (
              <>
                {theirs.updatedByName} saved a newer version <DateText value={theirs.updatedAt} relative /> while you
                were editing. Review their changes, then keep yours or theirs.
              </>
            ) : (
              'Loading the latest version…'
            )}
          </DialogDescription>
        </DialogHeader>
        {reviewing ? (
          theirs ? (
            <LazyDiffView oldText={theirs.text} newText={mineText} oldLabel={theirs.label} newLabel="Your changes" className="max-h-[55vh] overflow-y-auto" />
          ) : (
            <Skeleton className="h-48" />
          )
        ) : null}
        <DialogFooter>
          {!reviewing ? (
            <Button variant="secondary" onClick={() => setReviewing(true)} disabled={!theirs} className="sm:mr-auto">
              Review their changes
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onDiscard}>
            Discard mine and reload
          </Button>
          <Button variant="danger" onClick={onOverwrite} disabled={!theirs || pending}>
            Overwrite with my changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
