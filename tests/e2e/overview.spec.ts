import { expect, test, type Page } from '@playwright/test'
import { resetMockDb, signInAs, USERS } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetMockDb(page)
})

const items = (page: Page) => page.getByTestId('attention-item')

test('M4 acceptance: every Needs attention item opens its record and the counts match the seed', async ({
  page,
}) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop')
  await expect(page.getByTestId('attention-total')).toHaveText('9')
  // The list shows the eight most urgent; "Show all" adds the rest.
  await expect(items(page)).toHaveCount(8)
  await page.getByRole('button', { name: 'Show all 9' }).click()
  await expect(items(page)).toHaveCount(9)

  // Ranked by risk class: breach, request, approval, rotations, access review, connector, review, agreement.
  const kinds = await items(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))
  expect(kinds).toEqual([
    'breach_deadline',
    'dsr_due',
    'policy_approval',
    'secret_rotation',
    'secret_rotation',
    'access_review',
    'connector_failing',
    'review_overdue',
    'agreement_renewal',
  ])
  for (const kind of new Set(kinds)) {
    await expect(page.getByTestId(`attention-count-${kind}`)).toContainText(
      kind === 'secret_rotation' ? '2' : '1',
    )
  }

  // The breach row carries a live countdown.
  await expect(items(page).first()).toContainText('Decide whether NPC notification is required')
  await expect(items(page).first()).toContainText(/\d+ h \d+ min left/)

  // Each row opens the record it names (ID chip in the row = ID on the page).
  const expected = [
    { path: /\/privacy\/incidents\/inc_/, heading: /INC-\d{4}-0003/ },
    { path: /\/privacy\/requests\/dsr_/, heading: /DSR-\d{4}-0012/ },
    { path: /\/policies\/doc_itd_007/, heading: /ITD-007/ },
    { path: /\/security\/secrets\?q=SCR-005/, heading: /SCR-005/ },
    { path: /\/security\/secrets\?q=SCR-002/, heading: /SCR-002/ },
    { path: /\/security\/access-reviews\/ar_/, heading: /AR-002/ },
    { path: /\/evidence\/connectors$/, heading: /Hostinger/ },
    { path: /\/policies\/doc_itd_013/, heading: /ITD-013/ },
    { path: /\/privacy\/agreements\/agr_001/, heading: /AGR-001/ },
  ]
  for (const [i, e] of expected.entries()) {
    if (i >= 8) await page.getByRole('button', { name: 'Show all 9' }).click()
    await items(page).nth(i).click()
    await expect(page).toHaveURL(e.path)
    await expect(page.getByRole('main')).toContainText(e.heading)
    await page.goto('/3rdloop')
    await expect(items(page)).toHaveCount(8)
  }
})

test('tiles summarise documents and control coverage', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop')
  await expect(page.getByTestId('documents-total')).toHaveText('16')
  await expect(page.getByTestId('documents-card')).toContainText('Approved')
  await expect(page.getByTestId('coverage-card')).toContainText('ISO/IEC 27001:2022')
  await expect(page.getByTestId('recent-activity')).toBeVisible()
})

test('approvers are told which policy is theirs to decide; approving it clears the item', async ({
  page,
}) => {
  await signInAs(page, USERS.michael, '/3rdloop')
  const row = items(page).filter({ hasText: 'ITD-007' })
  await expect(row).toContainText('Ready for your decision')
  await row.click()
  await page.getByRole('button', { name: /^Approve v/ }).click()
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: /^Approve/ }).click()
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible()
  await page.goto('/3rdloop')
  await expect(items(page).filter({ hasText: 'ITD-007' })).toHaveCount(0)
})

test('staff get the simplified overview', async ({ page }) => {
  await signInAs(page, USERS.staff, '/3rdloop')
  await expect(page.getByText('Policies to read')).toBeVisible()
  await expect(page.getByLabel('Your question')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Report an incident' }).first()).toBeVisible()
  await expect(page.getByTestId('needs-attention')).toHaveCount(0)
  await expect(page.getByTestId('recent-activity')).toHaveCount(0)
})

test('auditors see tiles but no operational list', async ({ page }) => {
  await signInAs(page, USERS.auditor, '/3rdloop')
  await expect(page.getByTestId('documents-card')).toBeVisible()
  await expect(page.getByTestId('needs-attention')).toHaveCount(0)
})

test('Starter tenants have no control coverage', async ({ page }) => {
  await signInAs(page, USERS.clinicDpo, '/sample-clinic')
  await expect(page.getByTestId('documents-card')).toBeVisible()
  await expect(page.getByTestId('coverage-card')).toHaveCount(0)
})

test.describe('global search', () => {
  test('the palette hands off to the full search page', async ({ page }) => {
    await signInAs(page, USERS.jehnsen, '/3rdloop')
    await page.keyboard.press('Control+k')
    await page.getByPlaceholder(/Type a page/).fill('access control')
    await page.getByRole('option', { name: /See all results for access control/ }).click()
    await expect(page).toHaveURL(/\/3rdloop\/search\?q=access(\+|%20)control/)
    await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible()
    await expect(page.getByTestId('search-group-document')).toContainText('ITD-007')
  })

  test('groups results, highlights matches, narrows by type and shows all', async ({ page }) => {
    await signInAs(page, USERS.jehnsen, '/3rdloop/search?q=data')
    const policies = page.getByTestId('search-group-document')
    await expect(policies).toBeVisible()
    await expect(page.getByTestId('search-group-processing_activity')).toBeVisible()
    await expect(page.locator('mark').first()).toBeVisible()

    await page.getByRole('button', { name: /^Policies \d+/ }).click()
    await expect(page).toHaveURL(/type=document/)
    await expect(page.getByTestId('search-group-processing_activity')).toHaveCount(0)
    const shown = await page.getByTestId('search-result').count()
    const total = Number((await policies.locator('h2 span').textContent()) ?? '0')
    expect(shown).toBe(total)
  })

  test('finds a record by ID and opens it', async ({ page }) => {
    await signInAs(page, USERS.jehnsen, '/3rdloop/search')
    await page.getByLabel('Search records').fill('ITD-006')
    await expect(page).toHaveURL(/q=ITD-006/)
    await page.getByTestId('search-result').first().click()
    await expect(page).toHaveURL(/\/policies\/doc_itd_006/)
  })

  test('says so when nothing matches, and never finds a requester by name', async ({ page }) => {
    await signInAs(page, USERS.jehnsen, '/3rdloop/search')
    await page.getByLabel('Search records').fill('Maria Clara')
    await expect(page.getByRole('heading', { name: /No matches for “Maria Clara”/ })).toBeVisible()
  })

  test('only shows what the role can open', async ({ page }) => {
    await signInAs(page, USERS.staff, '/3rdloop/search?q=backup')
    await expect(page.getByTestId('search-group-document')).toBeVisible()
    await expect(page.getByTestId('search-group-incident')).toHaveCount(0)
  })
})

test.describe('notifications', () => {
  test('the bell lists deadlines with working links and marks them read', async ({ page }) => {
    await signInAs(page, USERS.jehnsen, '/3rdloop')
    const bell = page.getByRole('button', { name: /Notifications \(\d+ unread\)/ })
    await bell.click()
    await page.getByRole('link', { name: /DSR-\d{4}-0012 is due in 2 days/ }).click()
    await expect(page).toHaveURL(/\/privacy\/requests\/dsr_/)
    await expect(page.getByRole('button', { name: /Notifications \(1 unread\)/ })).toBeVisible()
  })
})
