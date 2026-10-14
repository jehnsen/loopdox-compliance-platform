import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { resetMockDb, signInAs, USERS } from './helpers'

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function expectNoViolations(page: Page, label: string) {
  // Popovers fade in; scanning mid-animation reports partial-opacity text as low contrast.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  )
  expect(summary, `axe violations on ${label}`).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await resetMockDb(page)
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme })

    test('auth pages', async ({ page }) => {
      for (const path of [
        '/login',
        '/forgot-password',
        '/reset-password?token=x',
        '/accept-invite/demo-invite-token',
      ]) {
        await page.goto(path)
        await expectNoViolations(page, path)
      }
    })

    test('app shell pages', async ({ page }) => {
      await signInAs(page, USERS.jehnsen)
      await expectNoViolations(page, '/select-org')
      for (const path of [
        '/3rdloop',
        '/3rdloop/security/risks',
        '/sample-clinic/security/assets',
        '/sample-clinic/ai-governance',
      ]) {
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await expectNoViolations(page, path)
      }
    })

    test('open command palette, notifications and user menu', async ({ page }) => {
      await signInAs(page, USERS.jehnsen, '/3rdloop')
      await page.keyboard.press('Control+k')
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, 'command palette')
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: /Notifications/ }).click()
      await expect(page.getByText('DSR-2026-0012 is due in 2 days')).toBeVisible()
      await expectNoViolations(page, 'notifications')
      await page.keyboard.press('Escape')
      await page.getByTestId('user-menu').click()
      await expectNoViolations(page, 'user menu')
    })

    test('forbidden page and staff overview', async ({ page }) => {
      await signInAs(page, USERS.staff)
      await expectNoViolations(page, 'staff overview')
      await page.goto('/3rdloop/settings/members')
      await expect(
        page.getByRole('heading', { name: 'You don’t have access to this' }),
      ).toBeVisible()
      await expectNoViolations(page, 'forbidden')
    })
  })
}

test.describe('mobile drawer', () => {
  test.use({ viewport: { width: 360, height: 740 } })
  test('has no violations when open', async ({ page }) => {
    await signInAs(page, USERS.jehnsen, '/3rdloop')
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
    await expectNoViolations(page, 'mobile drawer')
  })
})
