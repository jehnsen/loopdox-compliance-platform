import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { RiskForm } from '@/features/security/risk-form'

export const metadata: Metadata = { title: 'New risk' }

export default function Page() {
  return (
    <ModuleGuard feature="security" permission="security.edit">
      <RiskForm />
    </ModuleGuard>
  )
}
