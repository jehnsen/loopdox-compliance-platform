import { expect, test, type Page } from '@playwright/test'
import { addMonthsToDate, formatCalendarDate, todayInTz } from '@/lib/utils/dates'
import { resetMockDb, signInAs, USERS } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetMockDb(page)
})

/** Types at the end of the CodeMirror editor. */
async function typeAtEnd(page: Page, text: string) {
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(text)
}

function metadata(page: Page, label: string) {
  return page
    .locator('dl > div')
    .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`, 'i') }) })
    .locator('dd')
}

test('M2 acceptance: create → submit → approve → acknowledge → edit → diff → restore', async ({
  page,
}) => {
  // An editor creates a policy from the template.
  await signInAs(page, USERS.jehnsen, '/3rdloop/policies')
  await page.getByRole('link', { name: 'New policy' }).click()
  await page.getByRole('link', { name: /^Policy A rule the organisation/ }).click()
  await expect(page.getByLabel('Document ID')).toHaveValue('ITD-017')
  await page.getByLabel('Title').fill('Remote Work Policy')
  await page.getByRole('button', { name: 'Create draft' }).click()
  await expect(page).toHaveURL(/\/3rdloop\/policies\/doc_/)
  await expect(page.getByRole('heading', { level: 1, name: 'Remote Work Policy' })).toBeVisible()
  await expect(page.getByRole('main').getByText('Draft', { exact: true }).first()).toBeVisible()
  const policyUrl = page.url()

  // Submit for review.
  await page.getByRole('main').getByRole('button', { name: 'Submit v1 for review' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Submit v1 for review' }).click()
  // Jehnsen is an admin, so he could approve too; the status is what matters here.
  await expect(page.getByTestId('workflow-banner')).toContainText('v1 is ready for your decision')
  await expect(metadata(page, 'Status')).toHaveText('In review')

  // The approver approves: effective today, next review in 12 months (tenant timezone).
  await signInAs(page, USERS.michael, new URL(policyUrl).pathname)
  await expect(page.getByTestId('workflow-banner')).toContainText('v1 is ready for your decision')
  await page.getByRole('button', { name: 'Approve v1' }).click()
  const today = todayInTz('Asia/Manila')
  const nextReview = addMonthsToDate(today, 12)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText(formatCalendarDate(today))
  await expect(dialog).toContainText(formatCalendarDate(nextReview))
  await dialog.getByRole('button', { name: 'Approve v1' }).click()
  await expect(page.getByTestId('workflow-banner')).toHaveCount(0)
  await expect(metadata(page, 'Effective')).toHaveText(formatCalendarDate(today))
  await expect(metadata(page, 'Next review')).toHaveText(formatCalendarDate(nextReview))
  await expect(metadata(page, 'Approved by')).toHaveText('Michael Manabat')

  // Staff acknowledge it from My policies.
  await signInAs(page, USERS.staff, '/3rdloop/my-policies')
  const toRead = page.getByTestId('policies-to-read')
  await expect(toRead).toContainText('Remote Work Policy')
  await toRead
    .locator('li', { hasText: 'Remote Work Policy' })
    .getByRole('link', { name: 'Read and acknowledge' })
    .click()
  await page.getByRole('button', { name: 'I have read and understood this policy' }).click()
  await expect(page.getByText(/You acknowledged v1/)).toBeVisible()
  await page.goto('/3rdloop/my-policies')
  await expect(page.getByTestId('policies-to-read')).not.toContainText('Remote Work Policy')

  // A new edit returns it to Draft; v1 stays approved.
  await signInAs(page, USERS.jehnsen, `${new URL(policyUrl).pathname}/edit`)
  await expect(page.getByTestId('save-warning')).toContainText(
    'Saving returns this policy to Draft',
  )
  await typeAtEnd(page, '\nStaff use a VPN on public Wi-Fi.')
  await page.getByLabel('Change summary').fill('Require a VPN on public Wi-Fi.')
  await page.getByRole('button', { name: 'Save as v2' }).click()
  await expect(page).toHaveURL(policyUrl)
  await expect(page.getByTestId('approved-on-record')).toContainText(
    'v1 is the approved version on record',
  )

  // History shows the diff.
  await page.getByRole('tab', { name: 'History' }).click()
  const diff = page.getByRole('table', { name: 'Changes from v1 to v2' })
  await expect(diff).toContainText('Staff use a VPN on public Wi-Fi.')
  await expect(page.getByText(/^\+\d+ added$/)).toBeVisible()

  // Restore v1 as a new version.
  await page
    .getByRole('list', { name: 'Versions' })
    .getByRole('button', { name: /Version 1 Created/ })
    .click()
  await page.getByRole('button', { name: 'Restore as new version' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Restore as v3' }).click()
  await expect(page.getByLabel('Version 3').first()).toBeVisible()
  await page.getByRole('tab', { name: 'History' }).click()
  await expect(page.getByRole('list', { name: 'Versions' })).toContainText('Restored from v1')
  await page.getByRole('tab', { name: 'Page' }).click()
  await expect(page.getByRole('article')).toBeVisible()
  await expect(page.getByRole('article')).not.toContainText('VPN')
})

test('requesting changes needs a note and returns the policy to Draft', async ({ page }) => {
  await signInAs(page, USERS.michael, '/3rdloop/policies/doc_itd_007')
  await page.getByRole('button', { name: 'Request changes' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Request changes' }).click()
  await expect(dialog.getByText('Explain what needs to change')).toBeVisible()
  await dialog.getByLabel(/What needs to change/).fill('State how long privileged access lasts.')
  await dialog.getByRole('button', { name: 'Request changes' }).click()
  await expect(page.getByText('Michael Manabat requested changes to v3')).toBeVisible()
  await expect(page.getByText('“State how long privileged access lasts.”')).toBeVisible()
})

test('a version conflict offers review and overwrite', async ({ page, baseURL }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/policies/doc_itd_006/edit')
  await expect(page.getByLabel('Title')).toHaveValue('Information Security Policy')

  // Someone else saves first.
  const current = await page.request.get('/api/v1/orgs/3rdloop/documents/doc_itd_006')
  const { version } = (await current.json()) as { version: number }
  const res = await page.request.patch('/api/v1/orgs/3rdloop/documents/doc_itd_006', {
    headers: { origin: baseURL ?? '' },
    data: {
      ifVersion: version,
      bodyMarkdown: '## 1. Purpose\n\nChanged elsewhere.\n',
      changeSummary: 'Edited in another tab.',
    },
  })
  expect(res.status()).toBe(200)

  await typeAtEnd(page, '\nOne more line.')
  await page.getByLabel('Change summary').fill('Add a line.')
  await page.getByRole('button', { name: 'Save as v5' }).click()
  const dialog = page.getByRole('dialog', { name: 'Someone changed this' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Review their changes' }).click()
  await expect(dialog.getByRole('table')).toContainText('Changed elsewhere.')
  await dialog.getByRole('button', { name: 'Overwrite with my changes' }).click()
  await expect(page).toHaveURL('/3rdloop/policies/doc_itd_006')
  await expect(page.getByRole('article')).toContainText('One more line.')
})

test('staff never see drafts and cannot edit', async ({ page }) => {
  await signInAs(page, USERS.staff, '/3rdloop/policies')
  await expect(page.getByRole('table', { name: 'Policies' })).toContainText('ITD-006')
  await expect(page.getByRole('table', { name: 'Policies' })).not.toContainText('ITD-010')
  await expect(page.getByRole('link', { name: 'New policy' })).toHaveCount(0)

  // ITD-015 has a draft v3; staff see approved v2 only.
  await page.goto('/3rdloop/policies/doc_itd_015')
  await expect(page.getByLabel('Version 2').first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Activity' })).toHaveCount(0)

  await page.goto('/3rdloop/policies/doc_itd_010')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

test('[[ID]] links resolve to policies and flag missing pages', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/policies/doc_itd_006')
  const link = page.getByRole('article').getByRole('link', { name: 'ITD-007', exact: true }).first()
  await expect(link).toHaveAttribute('href', '/3rdloop/policies/doc_itd_007')
  await expect(link).toHaveAttribute('title', 'ITD-007 Access Control Policy')

  await page.goto('/3rdloop/policies/new?template=blank')
  await typeAtEnd(page, 'See [[ITD-999]] and [[ITD-004]].')
  await page.getByRole('radio', { name: 'Preview' }).click()
  const preview = page.getByLabel('Preview')
  await expect(preview.locator('.wikilink-broken')).toHaveAttribute(
    'title',
    'No page with this ID yet',
  )
  await expect(preview.getByRole('link', { name: 'ITD-004' })).toHaveAttribute(
    'href',
    '/3rdloop/policies/doc_itd_004',
  )
})

test('editors can reorder the tree from the keyboard menu', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/policies')
  const tree = page.getByRole('navigation', { name: 'Policy tree' })
  await tree.getByRole('button', { name: 'Reorder ITD-006' }).click()
  await page.getByRole('menuitem', { name: 'Move down' }).click()
  await expect(page.getByText('Moved ITD-006 Information Security Policy')).toBeVisible()
  // The toast shows on success; the tree updates when its query refetches just after.
  await expect
    .poll(async () => {
      const order = await tree.locator('a .font-mono').allTextContents()
      return order.indexOf('ITD-007') < order.indexOf('ITD-006')
    })
    .toBe(true)
})

test('the library filters by review state and keeps filters in the URL', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/policies?review=overdue')
  const table = page.getByRole('table', { name: 'Policies' })
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await expect(table).toContainText('ITD-013')
  await expect(table).toContainText('Review overdue')
})

test.describe('small screens', () => {
  test.use({ viewport: { width: 360, height: 740 } })

  test('policy pages never scroll sideways at 360px', async ({ page }) => {
    await signInAs(page, USERS.jehnsen, '/3rdloop/policies')
    for (const path of [
      '/3rdloop/policies',
      '/3rdloop/policies/doc_itd_006',
      '/3rdloop/policies/doc_itd_006?tab=history&v=4',
      '/3rdloop/policies/doc_itd_006/edit',
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      expect(overflow, path).toBeLessThanOrEqual(0)
    }
  })
})
