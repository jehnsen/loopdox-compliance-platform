import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import type { DocumentLookupItem } from '@/lib/api/types'
import { extractToc } from '@/lib/markdown/toc'
import { wikiLinkIds } from '@/lib/markdown/wiki-links'
import { MarkdownView } from '@/components/markdown/markdown-view'
import { SessionProvider, type Session } from '@/components/providers/session-provider'

const session = {
  user: { id: 'u', name: 'Test User', email: 't@example.test', title: null },
  memberships: [],
  org: {
    id: 'o',
    slug: '3rdloop',
    name: 'Org',
    tier: 'premium',
    timezone: 'Asia/Manila',
    currency: 'PHP',
    logoUrl: null,
    settings: {
      dsrResponseDays: 30,
      reviewReminderLeadDays: 30,
      classificationLabels: {
        public: 'Public',
        internal: 'Internal',
        confidential: 'Confidential',
        restricted: 'Restricted',
      },
    },
    version: 1,
    createdAt: '',
    updatedAt: '',
  },
  roles: ['admin'],
  tier: 'premium',
  permissions: [],
  usage: null,
  apiMode: 'mock',
} satisfies Session

function wrap(ui: ReactNode) {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <SessionProvider initial={session}>{ui}</SessionProvider>
    </QueryClientProvider>,
  )
}

const lookup: DocumentLookupItem[] = [
  {
    id: 'doc_itd_007',
    docId: 'ITD-007',
    title: 'Access Control Policy',
    status: 'approved',
    parentId: null,
    order: 0,
    reviewState: 'ok',
  },
]

describe('MarkdownView', () => {
  it('resolves [[ID]] links and flags missing pages', () => {
    const { container } = wrap(
      <MarkdownView
        lookup={lookup}
        markdown={'See the policy ([[ITD-007]]) and [[ITD-999]].\n\n- [[ITD-007]]'}
      />,
    )
    const links = container.querySelectorAll('a.wikilink')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', '/3rdloop/policies/doc_itd_007')
    expect(links[0]).toHaveTextContent(/^ITD-007$/)
    expect(links[0]).toHaveAttribute('title', 'ITD-007 Access Control Policy')
    // A link that is the whole list item also shows the title.
    expect(links[1]).toHaveTextContent('ITD-007 Access Control Policy')
    const broken = container.querySelector('.wikilink-broken')
    expect(broken).toHaveTextContent('ITD-999')
    expect(broken).toHaveAttribute('title', 'No page with this ID yet')
  })

  it('never renders raw HTML or script URLs', () => {
    const { container } = wrap(
      <MarkdownView
        lookup={[]}
        markdown={
          '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n[click](javascript:alert(1))\n\n<b>bold</b>'
        }
      />,
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    expect(container.querySelector('a')?.getAttribute('href') ?? '').not.toContain('javascript')
  })

  it('gives headings the same anchors as the table of contents', () => {
    const md =
      '## 1. Purpose\n\ntext\n\n### 3.1 **Access** and `MFA`\n\n## 1. Purpose\n\n```\n## not a heading\n```\n'
    const { container } = wrap(<MarkdownView lookup={[]} markdown={md} />)
    const ids = [...container.querySelectorAll('h2, h3')].map((h) => h.id)
    expect(extractToc(md).map((e) => e.id)).toEqual(ids)
    expect(ids).toEqual(['1-purpose', '31-access-and-mfa', '1-purpose-1'])
  })

  it('renders GFM tables inside a scroll container', () => {
    const { container } = wrap(
      <MarkdownView lookup={[]} markdown={'| A | B |\n| --- | --- |\n| 1 | 2 |'} />,
    )
    expect(container.querySelector('.table-wrap > table')).not.toBeNull()
  })
})

describe('wikiLinkIds', () => {
  it('lists distinct referenced IDs', () => {
    expect(wikiLinkIds('[[ITD-006]] [[itd-006]] [[ITD-007|Access]]')).toEqual([
      'ITD-006',
      'ITD-007',
    ])
  })
})
