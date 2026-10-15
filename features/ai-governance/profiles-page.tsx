'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { FlaskConicalIcon } from 'lucide-react'
import { isApiError } from '@/lib/api/client'
import { useProfiles, useTestPrompt, useUpdateProfile } from '@/lib/api/hooks/use-ai'
import type { AiProfile, AiPromptTestResult } from '@/lib/api/types'
import { useCan } from '@/lib/auth/can'
import { GUARDRAILS, MAX_BLOCKED_TOPICS, RECOGNIZERS, TEST_PROMPT_MAX } from '@/lib/ai'
import { useOrgSlug } from '@/components/providers/session-provider'
import { IdChip } from '@/components/chips'
import { FormError, FormField } from '@/components/form/form-field'
import { TagInput } from '@/components/form/tag-input'
import { PageHeader } from '@/components/page-header'
import { EmptyState, ErrorState } from '@/components/states'
import { StatusPill } from '@/components/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { aiCrumbs } from '@/features/ai-governance/shared'

interface Draft {
  piiRecognizers: string[]
  guardrails: string[]
  blockedTopics: string[]
  enabled: boolean
}

const draftOf = (p: AiProfile): Draft => ({
  piiRecognizers: p.piiRecognizers,
  guardrails: p.guardrails,
  blockedTopics: p.blockedTopics,
  enabled: p.enabled,
})

const sameDraft = (a: Draft, b: Draft) =>
  a.enabled === b.enabled &&
  [...a.piiRecognizers].sort().join() === [...b.piiRecognizers].sort().join() &&
  [...a.guardrails].sort().join() === [...b.guardrails].sort().join() &&
  a.blockedTopics.join('\n') === b.blockedTopics.join('\n')

const toggle = (list: string[], id: string, on: boolean) =>
  on ? [...list.filter((x) => x !== id), id] : list.filter((x) => x !== id)

function ToggleRow({
  label,
  hint,
  chip,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint: string
  chip?: string
  checked: boolean
  disabled: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <li>
      <label className="flex items-start gap-3 py-2">
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
          className="mt-0.5"
          aria-label={label}
        />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2 text-base font-medium">
            {label}
            {chip ? <IdChip>{chip}</IdChip> : null}
          </span>
          <span className="text-sm text-muted">{hint}</span>
        </span>
      </label>
    </li>
  )
}

/** Try a prompt against the settings as they stand on screen, saved or not. Nothing is stored. */
function PromptTester({
  profile,
  draft,
  dirty,
}: {
  profile: AiProfile
  draft: Draft
  dirty: boolean
}) {
  const org = useOrgSlug()
  const test = useTestPrompt(org, profile.id)
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState<AiPromptTestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = () => {
    setError(null)
    test.mutate(
      {
        prompt,
        config: {
          piiRecognizers: draft.piiRecognizers,
          guardrails: draft.guardrails,
          blockedTopics: draft.blockedTopics,
        },
      },
      {
        onSuccess: setResult,
        onError: (e) => setError(isApiError(e) ? e.message : 'The test failed. Try again.'),
      },
    )
  }

  return (
    <Card data-testid="prompt-tester">
      <CardHeader>
        <div>
          <CardTitle>Test a prompt</CardTitle>
          <CardDescription>
            See what VisorShield would mask or block. Test prompts aren’t stored or logged.
            {dirty ? ' This uses your unsaved changes.' : ''}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <FormField label="Prompt to test" error={error ?? undefined}>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            maxLength={TEST_PROMPT_MAX}
            placeholder="e.g. Draft a reply to Atty. Maria Reyes (maria@example.com), TIN 123-456-789-000."
          />
        </FormField>
        <div>
          <Button variant="secondary" onClick={run} disabled={!prompt.trim() || test.isPending}>
            <FlaskConicalIcon aria-hidden="true" /> {test.isPending ? 'Testing…' : 'Test prompt'}
          </Button>
        </div>
        {result ? (
          <div
            className="flex flex-col gap-3"
            data-testid="test-result"
            data-action={result.action}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Result</span>
              <StatusPill status={result.action} />
            </div>
            {result.reasons.length ? (
              <ul className="list-disc pl-5 text-base">
                {result.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
            <div>
              <p className="label-caps mb-1">What would be sent</p>
              <p
                className="rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-sm break-words whitespace-pre-wrap"
                data-testid="test-masked"
              >
                {result.masked}
              </p>
            </div>
            {result.findings.length ? (
              <ul className="flex flex-wrap gap-2" aria-label="What was found">
                {result.findings.map((f) => (
                  <li key={f.type} className="rounded-md bg-surface-2 px-2 py-0.5 text-sm">
                    {f.label} <span className="text-muted tabular-nums">× {f.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing personal or sensitive was found.</p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ProfileEditor({ profile }: { profile: AiProfile }) {
  const org = useOrgSlug()
  const can = useCan()
  const update = useUpdateProfile(org, profile.id)
  const edit = can('ai.edit')
  const saved = useMemo(() => draftOf(profile), [profile])
  const [draft, setDraft] = useState<Draft>(saved)
  const [error, setError] = useState<string | null>(null)
  const dirty = !sameDraft(draft, saved)

  const save = () => {
    setError(null)
    update.mutate(
      { ifVersion: profile.version, ...draft },
      {
        onSuccess: () => toast.success(`${profile.name} profile saved`),
        onError: (e) =>
          setError(
            isApiError(e) && e.isConflict
              ? 'Someone changed this profile. Reload the page to see their changes.'
              : isApiError(e)
                ? e.message
                : 'Couldn’t save. Try again.',
          ),
      },
    )
  }

  const groups = [...new Set(RECOGNIZERS.map((r) => r.group))]
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <FormError message={error} />
        <Card>
          <CardContent className="flex flex-col gap-3">
            <label className="flex items-start gap-3">
              <Switch
                checked={draft.enabled}
                onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
                disabled={!edit}
                className="mt-0.5"
                aria-label={`${profile.name} profile enabled`}
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-medium">
                  {draft.enabled ? 'In use' : 'Not in use'}
                </span>
                <span className="text-sm text-muted">{profile.description}</span>
              </span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Personal data to mask</CardTitle>
              <CardDescription>
                Matches are replaced, for example by [PH_TIN], before a prompt leaves.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {groups.map((g) => (
              <section key={g} aria-label={g}>
                <h3 className="label-caps">{g}</h3>
                <ul className="divide-y divide-line">
                  {RECOGNIZERS.filter((r) => r.group === g).map((r) => (
                    <ToggleRow
                      key={r.id}
                      label={r.label}
                      hint={`For example ${r.example}`}
                      chip={r.id}
                      checked={draft.piiRecognizers.includes(r.id)}
                      disabled={!edit}
                      onChange={(on) =>
                        setDraft({
                          ...draft,
                          piiRecognizers: toggle(draft.piiRecognizers, r.id, on),
                        })
                      }
                    />
                  ))}
                </ul>
              </section>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Guardrails</CardTitle>
              <CardDescription>Rules that stop a prompt, not just clean it.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-line">
              {GUARDRAILS.map((g) => (
                <ToggleRow
                  key={g.id}
                  label={g.label}
                  hint={g.description}
                  checked={draft.guardrails.includes(g.id)}
                  disabled={!edit}
                  onChange={(on) =>
                    setDraft({ ...draft, guardrails: toggle(draft.guardrails, g.id, on) })
                  }
                />
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Blocked topics</CardTitle>
              <CardDescription>
                A prompt that mentions one of these is stopped. Up to {MAX_BLOCKED_TOPICS} topics.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {edit ? (
              <FormField label="Topics" hint="Type a topic and press Enter.">
                <TagInput
                  value={draft.blockedTopics}
                  onChange={(blockedTopics) => setDraft({ ...draft, blockedTopics })}
                  placeholder="e.g. sealed court records"
                />
              </FormField>
            ) : draft.blockedTopics.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {draft.blockedTopics.map((t) => (
                  <li key={t} className="rounded-md bg-surface-2 px-2 py-0.5 text-sm">
                    {t}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">No topics are blocked.</p>
            )}
          </CardContent>
        </Card>

        {edit ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={save} disabled={!dirty || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save profile'}
            </Button>
            <Button variant="secondary" onClick={() => setDraft(saved)} disabled={!dirty}>
              Discard changes
            </Button>
            {dirty ? <span className="text-sm text-muted">You have unsaved changes.</span> : null}
          </div>
        ) : null}
      </div>
      <div className="xl:sticky xl:top-4">
        <PromptTester profile={profile} draft={draft} dirty={dirty} />
      </div>
    </div>
  )
}

export function ProfilesPage() {
  const org = useOrgSlug()
  const list = useProfiles(org)
  const items = list.data?.items ?? []
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Policy profiles"
        breadcrumbs={aiCrumbs({ label: 'Policy profiles' })}
        description="What VisorShield masks and blocks for each kind of work. Switch a profile on for the apps that need it."
        className="pb-0"
      />
      {list.isLoading ? (
        <Skeleton className="h-96" />
      ) : list.isError ? (
        <ErrorState title="Couldn’t load profiles" onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={FlaskConicalIcon}
          title="No profiles"
          body="Profiles appear here once VisorShield is set up."
        />
      ) : (
        <Tabs defaultValue={items[0]?.key}>
          <TabsList aria-label="Policy profiles">
            {items.map((p) => (
              <TabsTrigger key={p.id} value={p.key}>
                {p.name}
                {p.enabled ? <span className="sr-only"> (in use)</span> : null}
                {p.enabled ? (
                  <span aria-hidden="true" className="ml-1.5 size-1.5 rounded-full bg-ok" />
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          {items.map((p) => (
            // Remount after a save so the editor starts from what was saved.
            <TabsContent key={`${p.id}-${p.version}`} value={p.key} className="pt-4">
              <ProfileEditor profile={p} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
