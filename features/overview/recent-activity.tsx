import Link from 'next/link'
import type { ActivityItem } from '@/lib/api/types'
import { describeAction } from '@/components/activity-feed'
import { DateText } from '@/components/date-text'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/** The latest changes to records the user can open. */
export function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <Card data-testid="recent-activity">
      <CardHeader>
        <div>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>The latest changes across your records.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0 pb-0">
        {items.length ? (
          <table className="w-full min-w-120 text-left text-base">
            <caption className="sr-only">Recent activity</caption>
            <thead>
              <tr className="border-y border-line text-sm text-muted">
                <th scope="col" className="px-4 py-2 font-medium">
                  Who
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  What happened
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  Record
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  When
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-2 whitespace-nowrap">{e.actor?.name ?? 'System'}</td>
                  <td className="px-4 py-2">{describeAction(e)}</td>
                  <td className="max-w-64 truncate px-4 py-2">
                    {e.targetLabel ? (
                      e.href ? (
                        <Link href={e.href} className="hover:text-accent hover:underline">
                          {e.targetLabel}
                        </Link>
                      ) : (
                        e.targetLabel
                      )
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <DateText value={e.at} relative className="text-sm text-muted" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-4 pb-4 text-base text-muted">
            Changes to policies and privacy records show up here as they happen.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
