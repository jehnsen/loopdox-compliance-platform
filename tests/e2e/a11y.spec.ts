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

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`policies, ${scheme} mode`, () => {
    test.use({ colorScheme: scheme })

    test('editor pages', async ({ page }) => {
      await signInAs(page, USERS.jehnsen, '/3rdloop/policies')
      await expect(
        page.getByRole('table', { name: 'Policies' }).locator('tbody tr').first(),
      ).toBeVisible()
      await expectNoViolations(page, 'library')
      for (const [path, ready] of [
        ['/3rdloop/policies/doc_itd_006', 'article'],
        ['/3rdloop/policies/doc_itd_006?tab=history&v=4', 'table'],
        ['/3rdloop/policies/doc_itd_006?tab=history&v=4&diff=split', 'table'],
        ['/3rdloop/policies/doc_itd_006?tab=acknowledgements', 'table'],
        ['/3rdloop/policies/doc_itd_006?tab=controls', 'list'],
        ['/3rdloop/policies/doc_itd_006?tab=activity', 'list'],
        ['/3rdloop/policies/doc_itd_015', 'article'],
        ['/3rdloop/policies/doc_itd_013', 'article'],
        ['/3rdloop/policies/doc_itd_006/versions/2', 'article'],
        ['/3rdloop/policies/new', 'list'],
      ] as const) {
        await page.goto(path)
        await expect(page.getByRole(ready).first()).toBeVisible()
        await expectNoViolations(page, path)
      }
      await page.goto('/3rdloop/policies/doc_itd_006/edit')
      await expect(page.locator('.cm-content')).toBeVisible()
      await expectNoViolations(page, 'editor')
    })

    test('approver and staff pages', async ({ page }) => {
      await signInAs(page, USERS.michael, '/3rdloop/policies/doc_itd_007')
      await expect(page.getByTestId('workflow-banner')).toBeVisible()
      await expectNoViolations(page, 'in review')
      await page.getByRole('button', { name: 'Approve v3' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, 'approve dialog')

      await signInAs(page, USERS.staff, '/3rdloop/my-policies')
      await expect(page.getByTestId('policies-to-read')).toBeVisible()
      await expectNoViolations(page, 'my policies')
      await page.goto('/3rdloop/policies/doc_itd_008')
      await expect(
        page.getByRole('button', { name: 'I have read and understood this policy' }),
      ).toBeVisible()
      await expectNoViolations(page, 'acknowledge')
    })
  })
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`privacy, ${scheme} mode`, () => {
    test.use({ colorScheme: scheme })

    test('registers, records and forms', async ({ page }) => {
      // 18 pages, each scanned by axe.
      test.setTimeout(240_000)
      await signInAs(page, USERS.jehnsen, '/3rdloop/privacy/processing')
      for (const [path, ready] of [
        ['/3rdloop/privacy/processing', 'table'],
        ['/3rdloop/privacy/processing/pa_002', 'heading'],
        ['/3rdloop/privacy/processing/pa_002/edit', 'textbox'],
        ['/3rdloop/privacy/pia', 'table'],
        ['/3rdloop/privacy/pia/pia_001', 'table'],
        ['/3rdloop/privacy/pia/pia_002', 'table'],
        ['/3rdloop/privacy/requests', 'table'],
        ['/3rdloop/privacy/requests/dsr_2026_0012', 'heading'],
        ['/3rdloop/privacy/requests/new', 'textbox'],
        ['/3rdloop/privacy/incidents', 'table'],
        ['/3rdloop/privacy/incidents/inc_2026_0003', 'timer'],
        ['/3rdloop/privacy/incidents/inc_2026_0002', 'timer'],
        ['/3rdloop/privacy/incidents/report', 'textbox'],
        ['/3rdloop/privacy/agreements', 'table'],
        ['/3rdloop/privacy/agreements/agr_001', 'heading'],
        ['/3rdloop/privacy/agreements/new', 'textbox'],
        ['/3rdloop/privacy/registration', 'heading'],
        ['/3rdloop/privacy/training', 'table'],
      ] as const) {
        await page.goto(path)
        await expect(page.getByRole(ready).first()).toBeVisible()
        await expectNoViolations(page, path)
      }
    })

    test('notices, link dialog and approver view', async ({ page }) => {
      await signInAs(page, USERS.jehnsen, '/3rdloop/privacy/incidents/inc_2026_0003')
      await page.getByRole('button', { name: 'Draft notices' }).click()
      await expect(page.getByTestId('notice-npc')).toBeVisible()
      await expectNoViolations(page, 'drafted notices')
      await page.getByRole('button', { name: 'Link existing' }).click()
      await page.getByRole('menuitem', { name: 'System' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, 'link dialog')

      await signInAs(page, USERS.michael, '/3rdloop/privacy/incidents/inc_2026_0003')
      await expect(page.getByTestId('notices')).toBeVisible()
      await expectNoViolations(page, 'approver incident view')
    })
  })
}
