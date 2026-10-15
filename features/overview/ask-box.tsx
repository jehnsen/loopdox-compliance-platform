'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { MessageSquareTextIcon } from 'lucide-react'
import { useOrgSlug } from '@/components/providers/session-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Staff overview: ask a question about the approved policies. */
export function AskBox() {
  const org = useOrgSlug()
  const router = useRouter()
  const [q, setQ] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = q.trim()
    router.push(`/${org}/ask${text ? `?q=${encodeURIComponent(text)}` : ''}`)
  }
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Ask about our policies</CardTitle>
          <CardDescription>Answers come from approved policies, with sources.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <Label htmlFor="overview-ask" className="sr-only">
            Your question
          </Label>
          <Input
            id="overview-ask"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Can I use my personal laptop for work?"
            className="placeholder:text-muted"
            autoComplete="off"
          />
          <Button type="submit" variant="primary">
            <MessageSquareTextIcon aria-hidden="true" />
            Ask
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
