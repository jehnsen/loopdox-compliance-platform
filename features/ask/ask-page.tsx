'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { LibraryIcon, MessagesSquareIcon } from 'lucide-react'
import { useAskThread } from '@/lib/api/hooks/use-ask'
import { useOrgSlug } from '@/components/providers/session-provider'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Conversation, selectedAnswer } from '@/features/ask/conversation'
import { SourcesPanel } from '@/features/ask/sources-panel'
import { ThreadList } from '@/features/ask/thread-list'

/**
 * Full-page Ask: conversations on the left, the chat in the middle, and the sources
 * of the selected answer on the right (sheets on small screens).
 */
export function AskPage({ initialThreadId }: { initialThreadId: string | null }) {
  const org = useOrgSlug()
  const searchParams = useSearchParams()
  const [threadId, setThreadId] = useState<string | null>(initialThreadId)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [threadsOpen, setThreadsOpen] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  // ?q= is asked once, only on a fresh conversation.
  const [initialQuestion, setInitialQuestion] = useState(() =>
    initialThreadId ? null : searchParams.get('q'),
  )
  // Remount the chat only when the person picks another conversation, not when a new one gets its ID.
  const [chatKey, setChatKey] = useState(0)
  const thread = useAskThread(org, threadId)
  const citations = selectedAnswer(thread.data?.messages ?? [], selectedId)?.citations ?? []

  // Keep the URL in step without remounting the page (the answer may still be streaming).
  const show = (id: string | null) => {
    setThreadId(id)
    setSelectedId(null)
    setThreadsOpen(false)
    setInitialQuestion(null)
    setChatKey((k) => k + 1)
    window.history.replaceState(null, '', id ? `/${org}/ask/${id}` : `/${org}/ask`)
  }

  const threadList = <ThreadList activeId={threadId} onSelect={show} onNew={() => show(null)} />

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[32rem] flex-col">
      <PageHeader
        title="Ask"
        description="Answers from your approved policies and records, always with sources."
        className="pb-3"
        actions={
          <>
            <Button variant="secondary" className="lg:hidden" onClick={() => setThreadsOpen(true)}>
              <MessagesSquareIcon aria-hidden="true" /> Conversations
            </Button>
            <Button variant="secondary" className="xl:hidden" onClick={() => setSourcesOpen(true)}>
              <LibraryIcon aria-hidden="true" /> Sources
              {citations.length ? ` (${citations.length})` : ''}
            </Button>
          </>
        }
      />
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_20rem]">
        <aside className="hidden min-h-0 lg:flex lg:flex-col">{threadList}</aside>
        <section aria-label="Chat" className="flex min-h-0 flex-col">
          <Conversation
            key={chatKey}
            threadId={threadId}
            onThreadCreated={(id) => {
              setThreadId(id)
              window.history.replaceState(null, '', `/${org}/ask/${id}`)
            }}
            selectedId={selectedId}
            onSelectSources={(id) => {
              setSelectedId(id)
              // The sources column is visible from xl up; below that it opens as a sheet.
              if (!window.matchMedia('(min-width: 80rem)').matches) setSourcesOpen(true)
            }}
            initialQuestion={initialQuestion}
          />
        </section>
        <aside className="hidden min-h-0 overflow-y-auto xl:block">
          <SourcesPanel citations={citations} />
        </aside>
      </div>
      <Sheet open={threadsOpen} onOpenChange={setThreadsOpen}>
        <SheetContent side="left" className="lg:hidden">
          <SheetHeader>
            <SheetTitle>Conversations</SheetTitle>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col p-3">{threadList}</div>
        </SheetContent>
      </Sheet>
      <Sheet open={sourcesOpen} onOpenChange={setSourcesOpen}>
        <SheetContent className="xl:hidden">
          <SheetHeader>
            <SheetTitle>Sources</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto p-4">
            <SourcesPanel citations={citations} onNavigate={() => setSourcesOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
