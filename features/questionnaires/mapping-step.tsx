'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { WandSparklesIcon } from 'lucide-react'
import { useMapQuestionnaire } from '@/lib/api/hooks/use-questionnaires'
import { isApiError } from '@/lib/api/client'
import type { Questionnaire } from '@/lib/api/types'
import { cn } from '@/lib/utils/cn'
import { useOrgSlug } from '@/components/providers/session-provider'
import { FormError, FormField } from '@/components/form/form-field'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const NEW = 'new'

/** "C" for column 2. */
export function columnLetter(i: number): string {
  let n = i + 1
  let s = ''
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/** Step 2: which column holds the questions, and where the answers go. Drafting follows. */
export function MappingStep({ questionnaire: q }: { questionnaire: Questionnaire }) {
  const org = useOrgSlug()
  const map = useMapQuestionnaire(org, q.id)
  const suggested = q.suggestedMapping ?? { questionColumn: 0, answerColumn: null }
  const [questionColumn, setQuestionColumn] = useState(suggested.questionColumn)
  const [answerColumn, setAnswerColumn] = useState<number | null>(suggested.answerColumn)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const label = (i: number) => `${columnLetter(i)} · ${q.columns[i] ?? ''}`

  const submit = () => {
    setError(null)
    setFields({})
    map.mutate(
      { ifVersion: q.version, questionColumn, answerColumn },
      {
        onSuccess: (r) => {
          const needs = r.progress.needsInput
          toast.success(
            `Drafted ${r.progress.total} answers.${needs ? ` ${needs} need${needs === 1 ? 's' : ''} your input.` : ''}`,
          )
        },
        onError: (e) => {
          if (isApiError(e) && e.fields) setFields(e.fields)
          setError(isApiError(e) ? e.message : 'Couldn’t draft the answers. Try again.')
        },
      },
    )
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Choose the columns</CardTitle>
          <CardDescription>
            {q.fileName} has {q.columns.length} columns. We suggested the likely ones; check them
            against the preview.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="map-question"
            label="Questions are in"
            error={fields.questionColumn}
            required
          >
            <Select
              value={String(questionColumn)}
              onValueChange={(v) => {
                const n = Number(v)
                setQuestionColumn(n)
                if (answerColumn === n) setAnswerColumn(null)
              }}
            >
              <SelectTrigger id="map-question">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {q.columns.map((_, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {label(i)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField
            id="map-answer"
            label="Answers go in"
            hint="The exported file keeps every other column as it was."
            error={fields.answerColumn}
          >
            <Select
              value={answerColumn === null ? NEW : String(answerColumn)}
              onValueChange={(v) => setAnswerColumn(v === NEW ? null : Number(v))}
            >
              <SelectTrigger id="map-answer" aria-describedby="map-answer-hint">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {q.columns.map((_, i) =>
                  i === questionColumn ? null : (
                    <SelectItem key={i} value={String(i)}>
                      {label(i)}
                    </SelectItem>
                  ),
                )}
                <SelectItem value={NEW}>A new “Answer” column at the end</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[560px] text-sm" aria-label={`Preview of ${q.fileName}`}>
            <thead className="bg-surface-2 text-left">
              <tr>
                {q.columns.map((c, i) => (
                  <th
                    key={i}
                    scope="col"
                    className={cn(
                      'h-9 px-3 font-semibold whitespace-nowrap',
                      i === questionColumn && 'bg-accent-soft',
                      i === answerColumn && 'bg-ok-soft',
                    )}
                  >
                    <span className="mr-1 font-mono text-xs text-muted">{columnLetter(i)}</span>
                    {c}
                    {i === questionColumn ? (
                      <span className="ml-2 text-xs font-medium text-accent">Questions</span>
                    ) : null}
                    {i === answerColumn ? (
                      <span className="ml-2 text-xs font-medium text-ok">Answers</span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.preview.map((row, r) => (
                <tr key={r} className="border-t border-line align-top">
                  {q.columns.map((_, i) => (
                    <td
                      key={i}
                      className={cn(
                        'max-w-80 px-3 py-2',
                        i === questionColumn && 'bg-accent-soft/50',
                        i === answerColumn && 'bg-ok-soft/50',
                      )}
                    >
                      <span className="line-clamp-3">
                        {row[i] || <span className="text-muted">—</span>}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-muted">
          Each answer is drafted only from approved policy text, with its source. Questions no
          policy covers are marked “Needs input” instead of guessed.
        </p>
        <div className="flex justify-end">
          <Button variant="primary" onClick={submit} disabled={map.isPending}>
            <WandSparklesIcon aria-hidden="true" />{' '}
            {map.isPending ? 'Drafting answers…' : 'Draft answers'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
