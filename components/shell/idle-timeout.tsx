'use client'

import { useEffect, useRef, useState } from 'react'
import { IDLE_GRACE_SECONDS, IDLE_TIMEOUT_MINUTES } from '@/lib/config'
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
import { signOut } from '@/components/shell/user-menu'

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
const CHANNEL = 'loopdox-activity'

/**
 * After IDLE_TIMEOUT_MINUTES without activity (in any tab), asks "Still there?";
 * signs out after IDLE_GRACE_SECONDS more.
 */
export function IdleTimeout({
  timeoutMs = IDLE_TIMEOUT_MINUTES * 60_000,
  graceSeconds = IDLE_GRACE_SECONDS,
}: {
  timeoutMs?: number
  graceSeconds?: number
}) {
  const lastActivity = useRef(0)
  const [prompting, setPrompting] = useState(false)
  const [remaining, setRemaining] = useState(graceSeconds)
  const channel = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    lastActivity.current = Date.now()
    channel.current = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL)
    channel.current?.addEventListener('message', (e: MessageEvent<number>) => {
      lastActivity.current = Math.max(lastActivity.current, e.data)
    })
    let lastBroadcast = 0
    const onActivity = () => {
      const now = Date.now()
      lastActivity.current = now
      if (now - lastBroadcast > 10_000) {
        lastBroadcast = now
        channel.current?.postMessage(now)
      }
    }
    for (const ev of ACTIVITY_EVENTS) window.addEventListener(ev, onActivity, { passive: true })
    const tick = setInterval(() => {
      if (Date.now() - lastActivity.current >= timeoutMs) {
        setRemaining(graceSeconds)
        setPrompting(true)
      }
    }, 5_000)
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, onActivity)
      clearInterval(tick)
      channel.current?.close()
    }
  }, [timeoutMs, graceSeconds])

  useEffect(() => {
    if (!prompting) return
    const started = Date.now()
    const t = setInterval(() => {
      // Activity in another tab dismisses the prompt here too.
      if (Date.now() - lastActivity.current < timeoutMs) {
        setPrompting(false)
        return
      }
      const left = graceSeconds - Math.floor((Date.now() - started) / 1000)
      setRemaining(Math.max(0, left))
      if (left <= 0) {
        clearInterval(t)
        void signOut('idle')
      }
    }, 1000)
    return () => clearInterval(t)
  }, [prompting, graceSeconds, timeoutMs])

  const stay = () => {
    lastActivity.current = Date.now()
    channel.current?.postMessage(lastActivity.current)
    setPrompting(false)
  }

  return (
    <Dialog open={prompting} onOpenChange={(o) => (o ? null : stay())}>
      <DialogContent showClose={false}>
        <DialogHeader>
          <DialogTitle>{en.auth.stillThereTitle}</DialogTitle>
          <DialogDescription aria-live="polite">
            {en.auth.stillThereBody(remaining)}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => void signOut()}>
            {en.auth.signOut}
          </Button>
          <Button variant="primary" onClick={stay} autoFocus>
            {en.auth.staySignedIn}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
