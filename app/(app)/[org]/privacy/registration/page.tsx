import type { Metadata } from 'next'
import { ModuleGuard } from '@/features/shell/module-page'
import { RegistrationPage } from '@/features/privacy/registration-page'

export const metadata: Metadata = { title: 'NPC registration' }

export default function Page() {
  return (
    <ModuleGuard feature="privacy" permission="privacy.read">
      <RegistrationPage />
    </ModuleGuard>
  )
}
