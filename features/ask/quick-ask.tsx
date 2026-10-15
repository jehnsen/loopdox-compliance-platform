'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { ArrowLeftIcon, ExternalLinkIcon, PlusIcon } from 'lucide-react'
import { useAskThread } from '@/lib/api/hooks/use-ask'
import { useOrgSlug } from '@/components/providers/session-provider'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Conversation, selectedAnswer } from '@/features/ask/conversation'
import { contextFromPath } from '@/features/ask/meta'
import { SourcesPanel } from '@/features/ask/sources-panel'

interface QuickAsk {
  /** Opens the panel; with a question, starts a new conversation with it. */
  open: (question?: string) => void
}

const QuickAskContext = createContext<QuickAsk>({ open: () => undefined })

export function useQuickAsk(): QuickAsk {
  return useContext(QuickAskContext)
}

/**
 * The Quick Ask slide-over: the same chat as the Ask page, scoped to the record on
 * the current page (on ITD-007 it suggests questions about that policy).
 */
export function QuickAskProvider({ children }: { children: ReactNode }) {
  const org = useOrgSlug()
  const pathname = usePathname()
  const [isOpen, setOpen] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [question, setQuestion] = useState<string | null>(null)
  const [chatKey, setChatKey] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showSources, setShowSources] = useState(false)
  const context = useMemo(() => contextFromPath(pathname, org), [pathname, org])
  const thread = useAskThread(org, threadId)
  const citations = selectedAnswer(thread.data?.messages ?? [], selectedId)?.citations ?? []

  const restart = (q: string | null) => {
    setThreadId(null)
    setSelectedId(null)
    setShowSources(false)
    setQuestion(q)
    setChatKey((k) => k + 1)
  }

  const open = useCallback((q?: string) => {
    if (q) {
      setThreadId(null)
      setSelectedId(null)
      setShowSources(false)
      setQuestion(q)
      setChatKey((k) => k + 1)
    }
    setOpen(true)
  }, [])

  const value = useMemo(() => ({ open }), [open])

  // Following a citation leaves the panel: close it so the source is visible.
  const closeOnLink = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a[href^="/"]')
    if (a) setOpen(false)
  }

  return (
    <QuickAskContext.Provider value={value}>
      {children}
      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent className="w-[min(100vw,32rem)]" aria-describedby="quick-ask-desc">
          <SheetHeader>
            <SheetTitle>Ask</SheetTitle>
            <SheetDescription id="quick-ask-desc">
              {context
                ? 'Questions here favour the page you’re on.'
                : 'Answers from your approved policies and records.'}
            </SheetDescription>
            <div className="flex gap-1 pt-1">
              <Button variant="ghost" size="sm" onClick={() => restart(null)}>
                <PlusIcon aria-hidden="true" /> New
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link
                  href={threadId ? `/${org}/ask/${threadId}` : `/${org}/ask`}
                  onClick={() => setOpen(false)}
                >
                  <ExternalLinkIcon aria-hidden="true" /> Open full page
                </Link>
              </Button>
            </div>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col p-4" onClickCapture={closeOnLink}>
            {showSources ? (
              <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => setShowSources(false)}
                >
                  <ArrowLeftIcon aria-hidden="true" /> Back to the conversation
                </Button>
                <SourcesPanel citations={citations} />
              </div>
            ) : null}
            <div className={showSources ? 'hidden' : 'flex min-h-0 flex-1 flex-col'}>
              <Conversation
                key={chatKey}
                compact
                threadId={threadId}
                onThreadCreated={setThreadId}
                context={context}
                selectedId={selectedId}
                onSelectSources={(id) => {
                  setSelectedId(id)
                  setShowSources(true)
                }}
                initialQuestion={question}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </QuickAskContext.Provider>
  )
}
