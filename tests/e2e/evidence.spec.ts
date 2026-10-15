import { expect, test, type Page } from '@playwright/test'
import { resetMockDb, signInAs, USERS } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetMockDb(page)
})

const PDF = {
  name: 'siem-retention.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4'),
}

/** Opens a table facet, toggles the options, and waits for the menu to close before moving on. */
async function toggleFacet(page: Page, filter: RegExp, options: string[]) {
  await page.getByRole('button', { name: filter }).click()
  for (const name of options) await page.getByRole('menuitemcheckbox', { name }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
}

const card = (page: Page, name: string) =>
  page.getByTestId('connector-card').filter({ has: page.getByRole('heading', { name }) })

test('M6 acceptance: an auditor browses controls to approved policies to evidence, and changes nothing', async ({
  page,
}) => {
  // Auditors land on the audit pack.
  await signInAs(page, USERS.auditor)
  await expect(page).toHaveURL('/3rdloop/evidence/audit-pack')
  await expect(page.getByRole('heading', { level: 1, name: 'Audit pack' })).toBeVisible()
  await expect(page.getByTestId('pack-totals')).toContainText('Controls30')

  // Controls → approved policy → evidence.
  await page.getByRole('button', { name: /A\.5\.15 Access control/ }).click()
  const policies = page.getByTestId('pack-policy')
  await expect(policies).toHaveCount(2)
  // ITD-007 has a v3 waiting for approval, but v2 is the approved version on record.
  await expect(policies.filter({ hasText: 'ITD-007' })).toContainText('v2')
  await expect(policies.filter({ hasText: 'ITD-006' })).toContainText('v4')
  await expect(page.getByTestId('pack-evidence')).toHaveCount(1)
  await expect(page.getByTestId('pack-evidence')).toContainText('Access review')

  // A control whose policy was never approved shows no policy at all, not the draft.
  await page.getByRole('button', { name: /A\.8\.25 Secure development life cycle/ }).click()
  await expect(page.getByText('No approved policy is linked to this control.')).toBeVisible()
  await expect(page.getByText('Secure Development Policy')).toHaveCount(0)

  // The policy link opens the approved version.
  await policies.filter({ hasText: 'ITD-007' }).getByRole('link').click()
  await expect(page).toHaveURL(/\/policies\/doc_itd_007$/)
  await expect(page.getByText('In review')).toHaveCount(0)

  // The draft itself can't be opened.
  await page.goto('/3rdloop/policies/doc_itd_010')
  await expect(page.getByRole('heading', { name: /couldn’t find|not found/i })).toBeVisible()

  // Nothing to change: no upload or run buttons on a control, connectors or uploads.
  await page.goto('/3rdloop/evidence/controls/ctl_a_5_17')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Authentication information')
  await expect(page.getByTestId('evidence-item').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Upload evidence' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Run connector now' })).toHaveCount(0)
  await page.goto('/3rdloop/evidence/connectors')
  await expect(page.getByTestId('connector-card')).toHaveCount(4)
  await expect(
    page.getByRole('button', { name: /Run now|Connect|Reconfigure|Disconnect/ }),
  ).toHaveCount(0)
  await page.goto('/3rdloop/evidence/uploads')
  await expect(page.getByRole('table', { name: 'Uploads' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Upload evidence' })).toHaveCount(0)

  // And the API refuses the writes the page doesn't offer.
  const upload = await page.request.post('/api/v1/orgs/3rdloop/evidence', {
    multipart: {
      controlId: 'ctl_a_8_15',
      summary: 'Sneaking in evidence.',
      result: 'pass',
      file: PDF,
    },
  })
  expect(upload.status()).toBe(403)
  const run = await page.request.post('/api/v1/orgs/3rdloop/connectors/con_github/run')
  expect(run.status()).toBe(403)
})

test('controls: grouped by framework, with failing and missing evidence one filter away', async ({
  page,
}) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/evidence/controls')
  const table = page.getByRole('table', { name: 'Controls', exact: true })
  await expect(table.locator('tbody tr').first()).toBeVisible()
  for (const name of ['ISO/IEC 27001:2022', 'Data Privacy Act', 'NPC']) {
    await expect(table.getByRole('rowheader', { name })).toBeVisible()
  }
  await expect(table.locator('tbody tr[class*="border-b"]')).toHaveCount(30)

  await toggleFacet(page, /Filter by status/, ['Failing'])
  await expect(table.getByRole('link', { name: 'Authentication information' })).toBeVisible()
  await expect(
    table.getByRole('link', { name: 'ICT readiness for business continuity' }),
  ).toBeVisible()
  await expect(table.locator('tbody tr[class*="border-b"]')).toHaveCount(2)

  await toggleFacet(page, /Filter by status: Failing/, ['Failing', 'No evidence'])
  await expect(table.locator('tbody tr[class*="border-b"]')).toHaveCount(3)
  await expect(table.getByText('None yet')).toHaveCount(3)

  await table.getByRole('link', { name: 'Logging' }).click()
  await expect(page).toHaveURL(/\/evidence\/controls\/ctl_a_8_15$/)
})

test('uploading evidence puts it on the control’s timeline and turns the control green', async ({
  page,
}) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/evidence/controls/ctl_a_8_15')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Logging')
  await expect(page.getByText('No evidence yet')).toBeVisible()
  await expect(page.getByText('No evidence', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Upload evidence' }).click()
  const dialog = page.getByRole('dialog')
  // Nothing sent yet: the form says what is missing.
  await dialog.getByRole('button', { name: 'Upload evidence' }).click()
  await expect(dialog.getByText(/at least 10 characters/)).toBeVisible()
  await expect(dialog.getByText('Choose the file that backs this evidence.')).toBeVisible()

  // A file type the platform doesn't take is turned back before it is sent.
  await dialog.getByLabel('Choose the evidence file').setInputFiles({
    name: 'run.exe',
    mimeType: 'application/x-msdownload',
    buffer: Buffer.from('MZ'),
  })
  await expect(dialog.getByText(/isn’t a supported type/)).toBeVisible()

  await dialog.getByLabel('What this shows').fill('Log retention is set to 365 days in the SIEM.')
  await dialog.getByLabel('Choose the evidence file').setInputFiles(PDF)
  await expect(dialog.getByRole('button', { name: 'Remove siem-retention.pdf' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Upload evidence' }).click()

  await expect(page.getByText('Evidence added to A.8.15')).toBeVisible()
  await expect(dialog).toHaveCount(0)
  const items = page.getByTestId('evidence-item')
  await expect(items).toHaveCount(1)
  await expect(items.first()).toContainText('Log retention is set to 365 days')
  await expect(items.first()).toContainText('Upload')
  await expect(items.first().getByRole('link', { name: /siem-retention\.pdf/ })).toBeVisible()
  await expect(items.first()).toContainText('Recorded by Jehnsen Enrique')

  // The control is judged again, and the Uploads page lists the file.
  await expect(page.getByText('Passing', { exact: true })).toBeVisible()
  await page.goto('/3rdloop/evidence/uploads')
  const row = page.getByRole('table', { name: 'Uploads' }).locator('tbody tr').filter({
    hasText: 'siem-retention.pdf',
  })
  await expect(row).toContainText('A.8.15')
})

test('a failing upload turns a passing control red', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/evidence/controls/ctl_a_8_13')
  await page.getByRole('button', { name: 'Upload evidence' }).click()
  const dialog = page.getByRole('dialog')
  await dialog
    .getByLabel('What this shows')
    .fill('The restore test failed: the backup was corrupt.')
  await dialog.getByRole('radio', { name: 'Fail' }).check()
  await expect(dialog.getByText(/shows as failing until newer passing evidence/)).toBeVisible()
  await dialog.getByLabel('Choose the evidence file').setInputFiles(PDF)
  await dialog.getByRole('button', { name: 'Upload evidence' }).click()
  await expect(page.getByTestId('evidence-item').first()).toContainText('The restore test failed')
  await page.goto('/3rdloop/evidence/controls?status=failing')
  await expect(page.getByRole('link', { name: 'Information backup' })).toBeVisible()
})

test('connectors: a failing one explains the fix, and reconfiguring it clears the alert', async ({
  page,
}) => {
  // The failing connector is on the dashboard first.
  await signInAs(page, USERS.jehnsen, '/3rdloop')
  const attention = page.getByRole('link', { name: /Hostinger connector/ })
  await expect(attention).toBeVisible()
  await attention.click()
  await expect(page).toHaveURL(/\/evidence\/connectors$/)

  await expect(page.getByTestId('connector-card')).toHaveCount(4)
  const hostinger = card(page, 'Hostinger')
  await expect(hostinger).toContainText('Error')
  await expect(hostinger.getByTestId('connector-error')).toContainText(
    'rejected the saved API token',
  )
  await expect(hostinger.getByTestId('connector-error')).toContainText('How to fix it')
  await expect(card(page, 'Microsoft Azure')).toContainText('Disconnected')
  await expect(card(page, 'GitHub')).toContainText('Connected')

  // Running it while it can't connect fails and collects nothing.
  await hostinger.getByRole('button', { name: 'Run now for Hostinger' }).click()
  await expect(page.getByText(/Hostinger couldn’t be reached/)).toBeVisible()

  // Reconfigure takes an account, never a secret.
  await hostinger.getByRole('button', { name: /Reconfigure/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Hostinger account')).toHaveValue('ops@3rdloop.example')
  await expect(dialog.getByLabel(/token|password|key/i)).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Reconnect' }).click()
  await expect(page.getByText('Hostinger reconnected')).toBeVisible()
  await expect(hostinger.getByTestId('connector-error')).toHaveCount(0)
  await expect(hostinger).toContainText('Connected')

  await hostinger.getByRole('button', { name: 'Run now for Hostinger' }).click()
  await expect(page.getByText('Hostinger checked: 2 checks recorded, all passed')).toBeVisible()

  // The dashboard no longer lists it.
  await page.goto('/3rdloop')
  await expect(page.getByRole('heading', { name: 'Needs attention' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Hostinger connector/ })).toHaveCount(0)
})

test('connecting Azure and running it gives the Logging control its first evidence', async ({
  page,
}) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/evidence/connectors')
  const azure = card(page, 'Microsoft Azure')
  await expect(azure.getByText('Checks it will perform')).toBeVisible()
  await expect(azure.getByTestId('connector-check').first()).toContainText('Not run yet')
  await azure.getByRole('button', { name: /Connect/ }).click()
  await page.getByRole('dialog').getByLabel('Azure tenant').fill('3rdloop.onmicrosoft.com')
  await page.getByRole('dialog').getByRole('button', { name: 'Connect Microsoft Azure' }).click()
  await expect(azure).toContainText('Connected')

  await azure.getByRole('button', { name: 'Run now for Microsoft Azure' }).click()
  await expect(
    page.getByText('Microsoft Azure checked: 2 checks recorded, all passed'),
  ).toBeVisible()
  await expect(azure.getByTestId('connector-check').first()).toContainText('Passed')

  await azure.getByRole('link', { name: 'A.8.15' }).click()
  await expect(page).toHaveURL(/\/controls\/ctl_a_8_15$/)
  const items = page.getByTestId('evidence-item')
  await expect(items).toHaveCount(1)
  await expect(items.first()).toContainText('Connector · Microsoft Azure')
})

test('a control offers "Run connector now" for the connector that feeds it', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/evidence/controls/ctl_a_5_17')
  const before = await page.getByTestId('evidence-item').count()
  await page.getByRole('button', { name: 'Run connector now' }).click()
  await expect(
    page.getByText(/Google Workspace checked: 2 checks recorded, 1 failed/),
  ).toBeVisible()
  await expect(page.getByTestId('evidence-item')).toHaveCount(before + 1)
  await expect(page.getByTestId('evidence-item').first()).toContainText('2 of 14 accounts')
})

test('audit pack: the period changes what counts, and the pack exports', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/evidence/audit-pack')
  const totals = page.getByTestId('pack-totals')
  await expect(totals).toContainText('Passing25')
  await expect(totals).toContainText('No evidence3')

  await page.getByRole('combobox', { name: 'Period' }).click()
  await page.getByRole('option', { name: 'Last 90 days' }).click()
  await expect(page).toHaveURL(/period=90d/)
  // Evidence older than 90 days no longer counts for its control.
  await expect(totals).not.toContainText('Passing25')
  await expect(page.getByTestId('pack-period')).toContainText(' to ')

  await page.getByRole('combobox', { name: 'Period' }).click()
  await page.getByRole('option', { name: 'Custom range' }).click()
  await page.getByLabel('From', { exact: true }).fill('2026-10-10')
  // The URL updates after each date; let it settle before the next one.
  await expect(page).toHaveURL(/from=2026-10-10/)
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('2026-10-10')
  await page.getByLabel('To', { exact: true }).fill('2026-01-01')
  await expect(
    page.getByRole('alert').filter({ hasText: 'The period ends before it starts' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export pack' })).toBeDisabled()

  await page.getByRole('combobox', { name: 'Period' }).click()
  await page.getByRole('option', { name: 'All time' }).click()
  await expect(page.getByTestId('pack-period')).toHaveText('All evidence on record')
  await page.getByRole('button', { name: 'Expand all' }).click()
  await expect(page.getByTestId('pack-control').first().getByRole('region').first()).toBeVisible()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export pack' }).click()
  expect((await download).suggestedFilename()).toMatch(/^audit-pack-3rdloop-start_to_today\.csv$/)
})

test('search finds evidence and lands on it in the timeline', async ({ page }) => {
  await signInAs(page, USERS.auditor, '/3rdloop/search?q=restore+test')
  await expect(page.getByTestId('search-group-evidence')).toBeVisible()
  await page
    .getByRole('link', { name: /Quarterly restore test/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/evidence\/controls\/ctl_a_8_13#evd_/)
  await expect(
    page.getByTestId('evidence-item').filter({ hasText: 'Quarterly restore test' }),
  ).toBeVisible()
})

test('permissions and plans: approvers read, staff are turned away, Starter sees the upgrade card', async ({
  page,
}) => {
  await signInAs(page, USERS.michael, '/3rdloop/evidence/connectors')
  await expect(page.getByTestId('connector-card')).toHaveCount(4)
  await expect(page.getByRole('button', { name: /Run now|Connect|Reconfigure/ })).toHaveCount(0)
  await page.goto('/3rdloop/evidence/controls/ctl_a_5_15')
  await expect(page.getByRole('button', { name: 'Upload evidence' })).toHaveCount(0)

  await signInAs(page, USERS.staff, '/3rdloop/evidence/audit-pack')
  await expect(page.getByRole('heading', { name: 'You don’t have access to this' })).toBeVisible()

  await signInAs(page, USERS.clinicDpo, '/sample-clinic/evidence/controls')
  await expect(page.getByRole('heading', { level: 1, name: 'Controls' })).toBeVisible()
  await expect(page.getByTestId('upgrade-card')).toContainText('Evidence')
  await expect(page.getByRole('button', { name: /Contact us/ })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Controls' })).toHaveCount(0)
})
