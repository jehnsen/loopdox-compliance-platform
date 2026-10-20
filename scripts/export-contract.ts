/**
 * Exports the contract data the FastAPI backend mirrors: the seed, the shared rule
 * tables, the heading anchors of every seeded policy version, and JSON Schema for
 * every type in lib/api/types.ts.
 *
 *   pnpm tsx scripts/export-contract.ts [outDir]
 *
 * outDir defaults to $LOOPDOX_CONTRACT_DIR, else ../../loopdox-backend/contract.
 * Seed timestamps are relative to the moment this runs, so re-export before seeding a demo.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import GithubSlugger from 'github-slugger'
import {
  ASSESSMENT_QUESTIONS,
  GUARDRAILS,
  KEY_MIN_LENGTH,
  MAX_BLOCKED_TOPICS,
  PROFILE_KEYS,
  PROFILE_LABELS,
  RECOGNIZERS,
  TEST_PROMPT_MAX,
  TOPIC_MAX_LENGTH,
} from '../lib/ai'
import { isAuditorOnly, ROLE_PERMISSIONS } from '../lib/auth/permissions'
import {
  FEATURE_INFO,
  minimumTierFor,
  STARTER_ASK_MONTHLY_CAP,
  TIER_FEATURES,
  TIER_LABELS,
  UPGRADE_PATH,
  type Feature,
} from '../lib/entitlements'
import { FRAMEWORK_ORDER, PROVIDER_ORDER, PROVIDERS } from '../lib/evidence'
import {
  LINK_RELATIONS,
  linkPermission,
  RECORD_FEATURES,
  RECORD_LABELS,
  recordHref,
} from '../lib/links'
import { headingText, extractToc } from '../lib/markdown/toc'
import { splitSections } from '../lib/markdown/sections'
import type { RecordType, Role } from '../lib/api/types'
import { seedDatabase, SEED_VERSION } from '../mocks/seed'

const root = path.resolve(__dirname, '..')
const outDir = path.resolve(
  process.argv[2] ?? process.env.LOOPDOX_CONTRACT_DIR ?? path.join(root, '../../loopdox-backend/contract'),
)

function write(name: string, data: unknown): void {
  const file = path.join(outDir, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  console.log(`wrote ${path.relative(process.cwd(), file)}`)
}

/** Every heading (H1–H6) in source order with the anchor rehype-slug gives it. */
function headings(markdown: string): { level: number; text: string; id: string }[] {
  const slugger = new GithubSlugger()
  const out: { level: number; text: string; id: string }[] = []
  let fence: string | null = null
  for (const line of markdown.split('\n')) {
    const f = /^\s{0,3}(`{3,}|~{3,})/.exec(line)
    if (f?.[1]) {
      fence = fence ? (f[1][0] === fence ? null : fence) : (f[1][0] ?? null)
      continue
    }
    if (fence) continue
    const h = /^\s{0,3}(#{1,6})\s+(.*)$/.exec(line)
    if (!h?.[1] || h[2] === undefined) continue
    const text = headingText(h[2])
    out.push({ level: h[1].length, text, id: slugger.slug(text) })
  }
  return out
}

const now = new Date()
const db = seedDatabase(now)

write('seed.json', db)

const roles = Object.keys(ROLE_PERMISSIONS) as Role[]
write('permissions.json', {
  roles: ROLE_PERMISSIONS,
  auditorOnly: Object.fromEntries(roles.map((r) => [r, isAuditorOnly({ roles: [r] })])),
})

const features = Object.keys(FEATURE_INFO) as Feature[]
write('entitlements.json', {
  tiers: TIER_FEATURES,
  tierLabels: TIER_LABELS,
  upgradePath: UPGRADE_PATH,
  starterAskMonthlyCap: STARTER_ASK_MONTHLY_CAP,
  features: Object.fromEntries(
    features.map((f) => [f, { ...FEATURE_INFO[f], minimumTier: minimumTierFor(f) }]),
  ),
})

const recordTypes = Object.keys(RECORD_FEATURES) as RecordType[]
write('link-relations.json', {
  relations: LINK_RELATIONS,
  linkPermission: Object.fromEntries(recordTypes.map((t) => [t, linkPermission(t)])),
  recordFeatures: RECORD_FEATURES,
  recordLabels: RECORD_LABELS,
  recordHref: Object.fromEntries(recordTypes.map((t) => [t, recordHref('ORG', t, 'ID')])),
})

write('ai-catalog.json', {
  questions: ASSESSMENT_QUESTIONS,
  recognizers: RECOGNIZERS,
  guardrails: GUARDRAILS,
  profileKeys: PROFILE_KEYS,
  profileLabels: PROFILE_LABELS,
  maxBlockedTopics: MAX_BLOCKED_TOPICS,
  topicMaxLength: TOPIC_MAX_LENGTH,
  testPromptMax: TEST_PROMPT_MAX,
  keyMinLength: KEY_MIN_LENGTH,
})

write('connector-checks.json', {
  providerOrder: PROVIDER_ORDER,
  providers: PROVIDERS,
  frameworkOrder: FRAMEWORK_ORDER,
})

const docIds = new Map(db.documents.map((d) => [d.id, d.docId]))
write('anchors.json', {
  versions: db.documentVersions.map((v) => ({
    id: v.id,
    orgId: v.orgId,
    documentId: v.documentId,
    docId: docIds.get(v.documentId) ?? null,
    version: v.version,
    headings: headings(v.bodyMarkdown),
    toc: extractToc(v.bodyMarkdown),
    sections: splitSections(v.bodyMarkdown),
  })),
})

write('meta.json', {
  seedVersion: SEED_VERSION,
  exportedAt: now.toISOString(),
})

// JSON Schema for every exported type. Run through npx so the frontend's dependencies don't change.
const schemaFile = path.join(outDir, 'schemas', 'types.json')
fs.mkdirSync(path.dirname(schemaFile), { recursive: true })
execFileSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    '--yes',
    'ts-json-schema-generator@2.9.0',
    '--path',
    path.join(root, 'lib/api/types.ts'),
    '--type',
    '*',
    '--expose',
    'export',
    '--no-type-check',
    '--out',
    schemaFile,
  ],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
)
console.log(`wrote ${path.relative(process.cwd(), schemaFile)}`)
