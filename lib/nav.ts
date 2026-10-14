import {
  ActivityIcon,
  BadgeCheckIcon,
  BookOpenCheckIcon,
  BotIcon,
  Building2Icon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  CreditCardIcon,
  DatabaseIcon,
  FileCheck2Icon,
  FileClockIcon,
  FileSignatureIcon,
  FileTextIcon,
  FlameIcon,
  GaugeIcon,
  GitPullRequestIcon,
  GraduationCapIcon,
  HandshakeIcon,
  KeyRoundIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  ListChecksIcon,
  LockKeyholeIcon,
  MessageSquareTextIcon,
  PlugIcon,
  ScaleIcon,
  ScrollTextIcon,
  ServerIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SirenIcon,
  SlidersHorizontalIcon,
  UploadIcon,
  UserCheckIcon,
  UserRoundSearchIcon,
  UsersIcon,
  BellIcon,
  type LucideIcon,
} from 'lucide-react'
import type { Permission, Role, Tier } from '@/lib/api/types'
import { can } from '@/lib/auth/permissions'
import { hasFeature, type Feature } from '@/lib/entitlements'

export interface NavItem {
  id: string
  label: string
  /** Path under /[org]; '' is the Overview. */
  path: string
  icon: LucideIcon
  permission?: Permission
  /** Overrides the group's feature (e.g. Ask is gated on ask.policy). */
  feature?: Feature
  /** Milestone that builds the page; shown on placeholder pages until then. */
  milestone?: string
}

export interface NavGroup {
  id: string
  label: string
  icon: LucideIcon
  feature?: Feature
  premium?: boolean
  items: NavItem[]
}

/** Sidebar groups (section 4): Overview · Policies · Privacy · Security · Evidence · Ask · Questionnaires · AI Governance · Settings. */
export const NAV: readonly NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: LayoutDashboardIcon,
    items: [{ id: 'overview', label: 'Overview', path: '', icon: LayoutDashboardIcon }],
  },
  {
    id: 'policies',
    label: 'Policies',
    icon: LibraryIcon,
    feature: 'policies',
    items: [
      {
        id: 'policies',
        label: 'Policy library',
        path: '/policies',
        icon: LibraryIcon,
        permission: 'policies.read',
        milestone: 'M2',
      },
      {
        id: 'my-policies',
        label: 'My policies',
        path: '/my-policies',
        icon: BookOpenCheckIcon,
        permission: 'policies.acknowledge',
        milestone: 'M2',
      },
    ],
  },
  {
    id: 'privacy',
    label: 'Privacy',
    icon: ShieldIcon,
    feature: 'privacy',
    items: [
      {
        id: 'processing',
        label: 'Processing records',
        path: '/privacy/processing',
        icon: DatabaseIcon,
        permission: 'privacy.read',
        milestone: 'M3',
      },
      {
        id: 'pia',
        label: 'Impact assessments',
        path: '/privacy/pia',
        icon: ScaleIcon,
        permission: 'privacy.read',
        milestone: 'M3',
      },
      {
        id: 'requests',
        label: 'Data subject requests',
        path: '/privacy/requests',
        icon: UserRoundSearchIcon,
        permission: 'privacy.read',
        milestone: 'M3',
      },
      {
        id: 'incidents',
        label: 'Incidents & breaches',
        path: '/privacy/incidents',
        icon: SirenIcon,
        permission: 'privacy.read',
        milestone: 'M3',
      },
      {
        id: 'agreements',
        label: 'Agreements',
        path: '/privacy/agreements',
        icon: HandshakeIcon,
        permission: 'privacy.read',
        milestone: 'M3',
      },
      {
        id: 'registration',
        label: 'NPC registration',
        path: '/privacy/registration',
        icon: LandmarkIcon,
        permission: 'privacy.read',
        milestone: 'M3',
      },
      {
        id: 'training',
        label: 'Training',
        path: '/privacy/training',
        icon: GraduationCapIcon,
        permission: 'privacy.read',
        milestone: 'M3',
      },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    icon: ShieldCheckIcon,
    feature: 'security',
    items: [
      {
        id: 'assets',
        label: 'Systems',
        path: '/security/assets',
        icon: ServerIcon,
        permission: 'security.read',
        milestone: 'M5',
      },
      {
        id: 'access',
        label: 'Access grants',
        path: '/security/access',
        icon: UserCheckIcon,
        permission: 'security.read',
        milestone: 'M5',
      },
      {
        id: 'access-reviews',
        label: 'Access reviews',
        path: '/security/access-reviews',
        icon: ClipboardCheckIcon,
        permission: 'security.read',
        milestone: 'M5',
      },
      {
        id: 'secrets',
        label: 'Secrets',
        path: '/security/secrets',
        icon: KeyRoundIcon,
        permission: 'security.read',
        milestone: 'M5',
      },
      {
        id: 'changes',
        label: 'Changes',
        path: '/security/changes',
        icon: GitPullRequestIcon,
        permission: 'security.read',
        milestone: 'M5',
      },
      {
        id: 'risks',
        label: 'Risks',
        path: '/security/risks',
        icon: FlameIcon,
        permission: 'security.read',
        milestone: 'M5',
      },
      {
        id: 'decisions',
        label: 'Decisions',
        path: '/security/decisions',
        icon: FileSignatureIcon,
        permission: 'security.read',
        milestone: 'M5',
      },
    ],
  },
  {
    id: 'evidence',
    label: 'Evidence',
    icon: BadgeCheckIcon,
    feature: 'evidence',
    items: [
      {
        id: 'controls',
        label: 'Controls',
        path: '/evidence/controls',
        icon: ListChecksIcon,
        permission: 'evidence.read',
        milestone: 'M6',
      },
      {
        id: 'connectors',
        label: 'Connectors',
        path: '/evidence/connectors',
        icon: PlugIcon,
        permission: 'evidence.read',
        milestone: 'M6',
      },
      {
        id: 'uploads',
        label: 'Uploads',
        path: '/evidence/uploads',
        icon: UploadIcon,
        permission: 'evidence.read',
        milestone: 'M6',
      },
    ],
  },
  {
    id: 'ask',
    label: 'Ask',
    icon: MessageSquareTextIcon,
    feature: 'ask.policy',
    items: [
      {
        id: 'ask',
        label: 'Ask',
        path: '/ask',
        icon: MessageSquareTextIcon,
        permission: 'ask.use',
        milestone: 'M7',
      },
    ],
  },
  {
    id: 'questionnaires',
    label: 'Questionnaires',
    icon: ClipboardListIcon,
    feature: 'questionnaires',
    items: [
      {
        id: 'questionnaires',
        label: 'Questionnaires',
        path: '/questionnaires',
        icon: ClipboardListIcon,
        permission: 'questionnaires.read',
        milestone: 'M7',
      },
    ],
  },
  {
    id: 'ai',
    label: 'AI Governance',
    icon: BotIcon,
    feature: 'aiGovernance',
    premium: true,
    items: [
      {
        id: 'ai-overview',
        label: 'Overview',
        path: '/ai-governance',
        icon: GaugeIcon,
        permission: 'ai.read',
        milestone: 'M8',
      },
      {
        id: 'ai-inventory',
        label: 'Inventory',
        path: '/ai-governance/inventory',
        icon: BotIcon,
        permission: 'ai.read',
        milestone: 'M8',
      },
      {
        id: 'ai-assessments',
        label: 'Assessments',
        path: '/ai-governance/assessments',
        icon: FileCheck2Icon,
        permission: 'ai.read',
        milestone: 'M8',
      },
      {
        id: 'ai-profiles',
        label: 'Policy profiles',
        path: '/ai-governance/profiles',
        icon: SlidersHorizontalIcon,
        permission: 'ai.read',
        milestone: 'M8',
      },
      {
        id: 'ai-keys',
        label: 'Provider keys',
        path: '/ai-governance/keys',
        icon: LockKeyholeIcon,
        permission: 'ai.read',
        milestone: 'M8',
      },
      {
        id: 'ai-events',
        label: 'Events',
        path: '/ai-governance/events',
        icon: ActivityIcon,
        permission: 'ai.read',
        milestone: 'M8',
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: SettingsIcon,
    items: [
      {
        id: 'organisation',
        label: 'Organisation',
        path: '/settings/organisation',
        icon: Building2Icon,
        permission: 'org.manage',
        milestone: 'M9',
      },
      {
        id: 'members',
        label: 'Members',
        path: '/settings/members',
        icon: UsersIcon,
        permission: 'members.manage',
        milestone: 'M9',
      },
      {
        id: 'plan',
        label: 'Plan',
        path: '/settings/plan',
        icon: CreditCardIcon,
        permission: 'plan.manage',
        milestone: 'M9',
      },
      {
        id: 'notifications',
        label: 'Notifications',
        path: '/settings/notifications',
        icon: BellIcon,
        milestone: 'M9',
      },
      {
        id: 'audit-log',
        label: 'Audit log',
        path: '/settings/audit-log',
        icon: ScrollTextIcon,
        permission: 'audit_log.read',
        milestone: 'M9',
      },
    ],
  },
]

/** A VisorShield-only tenant sees only these groups. */
const VISORSHIELD_GROUPS = new Set(['overview', 'ai', 'settings'])

export interface VisibleNavItem extends NavItem {
  href: string
  /** Visible but not in the plan: shows a lock and opens the upgrade card. */
  locked: boolean
  feature?: Feature
}

export interface VisibleNavGroup extends Omit<NavGroup, 'items'> {
  items: VisibleNavItem[]
}

/**
 * Nav for a user in an org: items the role can't access are hidden; items the
 * tier doesn't include stay visible and locked.
 */
export function visibleNav(org: string, roles: readonly Role[], tier: Tier): VisibleNavGroup[] {
  const groups: VisibleNavGroup[] = []
  for (const group of NAV) {
    if (tier === 'visorshield_only' && !VISORSHIELD_GROUPS.has(group.id)) continue
    const items = group.items
      .filter((it) => !it.permission || can({ roles }, it.permission))
      .map((it) => {
        const feature = it.feature ?? group.feature
        return {
          ...it,
          feature,
          href: `/${org}${it.path}`,
          locked: feature ? !hasFeature(tier, feature) : false,
        }
      })
    if (items.length) groups.push({ ...group, items })
  }
  return groups
}

/** The nav item whose path is the longest prefix of `subpath` (path under /[org]). */
export function findNavItem(subpath: string): { group: NavGroup; item: NavItem } | null {
  let best: { group: NavGroup; item: NavItem } | null = null
  for (const group of NAV) {
    for (const item of group.items) {
      const matches =
        item.path === ''
          ? subpath === ''
          : subpath === item.path || subpath.startsWith(`${item.path}/`)
      if (matches && (!best || item.path.length > best.item.path.length)) best = { group, item }
    }
  }
  return best
}

/** Icon used for the "Report an incident" quick action. */
export const ReportIncidentIcon = ShieldAlertIcon
export const DsrIcon = FileClockIcon
export const NewPolicyIcon = FileTextIcon
