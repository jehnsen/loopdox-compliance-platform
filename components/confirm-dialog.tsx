'use client'

import { useId, useState, type ReactNode } from 'react'
import { en } from '@/lib/i18n/en'
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
import { Label } from '@/components/ui/label'

/**
 * Confirmation dialog. For destructive actions pass `typedConfirmation` (e.g. the
 * record ID); the confirm button stays disabled until it's typed exactly.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  typedConfirmation,
  pending = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description: ReactNode
  confirmLabel: string
  destructive?: boolean
  typedConfirmation?: string
  pending?: boolean
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState('')
  const inputId = useId()
  const ready = !typedConfirmation || typed === typedConfirmation
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setTyped('')
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {typedConfirmation ? (
          <div className="grid gap-1.5">
            <Label htmlFor={inputId}>{en.confirm.typeToConfirm(typedConfirmation)}</Label>
            <Input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {en.confirm.cancel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            disabled={!ready || pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
