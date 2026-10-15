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
        '/3rdloop/search?q=data',
        '/3rdloop/search?q=zzzz',
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

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`security, ${scheme} mode`, () => {
    test.use({ colorScheme: scheme })

    test('registers, records and forms', async ({ page }) => {
      test.setTimeout(240_000)
      await signInAs(page, USERS.jehnsen, '/3rdloop/security/assets')
      for (const [path, ready] of [
        ['/3rdloop/security/assets', 'table'],
        ['/3rdloop/security/assets/sys_github', 'heading'],
        ['/3rdloop/security/assets/sys_github/edit', 'textbox'],
        ['/3rdloop/security/assets/new', 'textbox'],
        ['/3rdloop/security/access', 'heading'],
        ['/3rdloop/security/access?view=person', 'heading'],
        ['/3rdloop/security/access-reviews', 'table'],
        ['/3rdloop/security/access-reviews/new', 'textbox'],
        ['/3rdloop/security/secrets', 'table'],
        ['/3rdloop/security/changes', 'table'],
        ['/3rdloop/security/risks', 'table'],
        ['/3rdloop/security/risks/risk_001', 'heading'],
        ['/3rdloop/security/risks/risk_001/edit', 'textbox'],
        ['/3rdloop/security/risks/new', 'textbox'],
        ['/3rdloop/security/decisions', 'table'],
        ['/3rdloop/security/decisions/adr_001', 'heading'],
        ['/3rdloop/security/decisions/adr_003', 'heading'],
        ['/3rdloop/security/decisions/new?supersedes=adr_001', 'textbox'],
        ['/3rdloop/evidence/controls/ctl_a_5_15', 'list'],
      ] as const) {
        await page.goto(path)
        await expect(page.getByRole(ready).first()).toBeVisible()
        await expectNoViolations(page, path)
      }
    })

    test('review run page and dialogs', async ({ page }) => {
      test.setTimeout(120_000)
      await signInAs(page, USERS.jehnsen, '/3rdloop/security/access-reviews')
      await page
        .getByRole('link', { name: /Access review \d{4}-Q\d/ })
        .first()
        .click()
      await expect(page.getByTestId('review-progress')).toBeVisible()
      await expectNoViolations(page, 'review run page')
      await page.getByRole('radio', { name: 'Revoke' }).first().click()
      await expectNoViolations(page, 'revoke editor')

      await page.goto('/3rdloop/security/access')
      await page.getByRole('button', { name: 'Add access' }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, 'grant dialog')
      await page.keyboard.press('Escape')

      await page.goto('/3rdloop/security/secrets')
      await page.getByRole('button', { name: 'Add secret record' }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, 'secret dialog')
      await page.keyboard.press('Escape')

      await page.goto('/3rdloop/security/changes')
      await page.getByRole('button', { name: 'Log a change' }).first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, 'change dialog')
    })

    test('evidence pages and dialogs', async ({ page }) => {
      await signInAs(page, USERS.jehnsen)
      for (const path of [
        '/3rdloop/evidence/controls',
        '/3rdloop/evidence/controls/ctl_a_5_15',
        '/3rdloop/evidence/connectors',
        '/3rdloop/evidence/uploads',
        '/3rdloop/evidence/audit-pack',
        '/sample-clinic/evidence/controls',
      ]) {
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
        await expectNoViolations(page, path)
      }

      await page.goto('/3rdloop/evidence/audit-pack')
      await page.getByRole('button', { name: 'Expand all' }).click()
      await expect(page.getByTestId('pack-policy').first()).toBeVisible()
      await expectNoViolations(page, 'audit pack, expanded')

      await page.goto('/3rdloop/evidence/controls/ctl_a_8_15')
      await page.getByRole('button', { name: 'Upload evidence' }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, 'upload evidence dialog')
      await page.keyboard.press('Escape')

      await page.goto('/3rdloop/evidence/connectors')
      await page
        .getByRole('button', { name: /Reconfigure/ })
        .first()
        .click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, 'connector dialog')
    })

    test('read-only views for the approver and auditor', async ({ page }) => {
      await signInAs(page, USERS.michael, '/3rdloop/security/risks')
      await expect(page.getByRole('table').first()).toBeVisible()
      await expectNoViolations(page, 'approver risks')
      await signInAs(page, USERS.auditor, '/3rdloop/security/access-reviews')
      await expect(page.getByRole('table').first()).toBeVisible()
      await expectNoViolations(page, 'auditor reviews')
      await signInAs(page, USERS.auditor, '/3rdloop/evidence/audit-pack')
      await expect(page.getByTestId('pack-totals')).toBeVisible()
      await expectNoViolations(page, 'auditor audit pack')
    })
  })
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`ask and questionnaires, ${scheme} mode`, () => {
    test.use({ colorScheme: scheme })

    test('ask pages', async ({ page }) => {
      await signInAs(page, USERS.jehnsen, '/3rdloop/ask')
      await expect(
        page.getByRole('heading', { name: 'Ask about your policies and records' }),
      ).toBeVisible()
      await expectNoViolations(page, 'ask (empty)')
      await page.goto('/3rdloop/ask/thr_seed_1')
      await expect(page.getByTestId('answer')).toHaveCount(2)
      await expectNoViolations(page, 'ask thread')
      const box = page.getByLabel('Your question')
      await box.fill('What is the guest Wi-Fi password at the Cebu office?')
      await box.press('Enter')
      await expect(page.getByTestId('answer-not-found')).toBeVisible()
      await expectNoViolations(page, 'ask not found')
      await page.goto('/3rdloop/policies/doc_itd_007')
      await page.getByRole('banner').getByRole('button', { name: 'Ask' }).click()
      await expect(page.getByRole('dialog', { name: 'Ask' })).toBeVisible()
      await expectNoViolations(page, 'quick ask')
    })

    test('starter ask at the cap', async ({ page }) => {
      await page.request.post('/api/mock/usage', {
        data: { org: 'sample-clinic', askQuestions: 100 },
      })
      await signInAs(page, USERS.clinicStaff, '/sample-clinic/ask')
      await expect(page.getByTestId('ask-capped')).toBeVisible()
      await expectNoViolations(page, 'ask capped')
    })

    test('questionnaire pages', async ({ page }) => {
      await signInAs(page, USERS.jehnsen, '/3rdloop/questionnaires')
      await expect(
        page.getByRole('table', { name: 'Questionnaires' }).locator('tbody tr').first(),
      ).toBeVisible()
      await expectNoViolations(page, 'questionnaires')
      await page.goto('/3rdloop/questionnaires/upload')
      await expect(page.getByRole('heading', { name: 'Upload a questionnaire' })).toBeVisible()
      await expectNoViolations(page, 'upload')
      await page.goto('/3rdloop/questionnaires/qnr_seed_1')
      const grid = page.getByRole('grid', { name: 'Answers' })
      await expect(grid).toBeVisible()
      await expectNoViolations(page, 'review grid')
      await grid.locator('tbody tr').nth(6).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByLabel('Answer to question 7')).toBeFocused()
      await expectNoViolations(page, 'review grid editing')
    })

    test('mapping step', async ({ page }) => {
      await signInAs(page, USERS.jehnsen, '/3rdloop/questionnaires/upload')
      await page.getByLabel('Name').fill('Annual review')
      await page.getByLabel('Client').fill('Example Client Inc.')
      await page.locator('input[type="file"]').setInputFiles({
        name: 'review.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from('Question,Answer\r\nDo you back up daily?,\r\n'),
      })
      await page.getByRole('button', { name: 'Upload and continue' }).click()
      await expect(page.getByRole('heading', { name: 'Choose the columns' })).toBeVisible()
      await expectNoViolations(page, 'mapping')
    })
  })
}
