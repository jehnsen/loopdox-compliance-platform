import { expect, type Page } from '@playwright/test'

export const USERS = {
  jehnsen: 'jehnsen.enrique@3rdloop.example',
  michael: 'michael.manabat@3rdloop.example',
  staff: 'staff@3rdloop.example',
  auditor: 'auditor@audit-firm.example',
  clinicDpo: 'liza.santos@sample-clinic.example',
  clinicStaff: 'frontdesk@sample-clinic.example',
} as const

export async function resetMockDb(page: Page): Promise<void> {
  const res = await page.request.post('/api/mock/reset')
  expect(res.ok()).toBe(true)
}

/** Signs in through the mock-mode "Sign in as…" list (signing out any current user first). */
export async function signInAs(page: Page, email: string, next?: string): Promise<void> {
  await page.context().clearCookies()
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
  await page.getByTestId(`sign-in-as-${email}`).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

export function mainNav(page: Page) {
  return page.getByRole('navigation', { name: 'Main' })
}
