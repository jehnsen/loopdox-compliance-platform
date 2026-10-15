import { expect, test, type Page } from '@playwright/test'
import { resetMockDb, signInAs, USERS } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetMockDb(page)
})

const rows = (page: Page, table: string) =>
  page.getByRole('table', { name: table, exact: true }).locator('tbody tr')

test('M5 acceptance: completing an access review puts evidence on the access control’s timeline', async ({
  page,
}) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/security/access-reviews')
  await rows(page, 'Access reviews').filter({ hasText: 'AR-002' }).getByRole('link').click()
  const progress = page.getByTestId('review-progress')
  await expect(progress).toHaveText('6 of 11 decided')

  // Sign-off waits until every grant has a decision.
  await expect(page.getByRole('button', { name: 'Sign off review' })).toBeDisabled()
  await page.getByRole('button', { name: /Keep all undecided \(5\)/ }).click()
  await expect(progress).toHaveText('11 of 11 decided')

  await page.getByRole('button', { name: 'Sign off review' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sign off review' }).click()
  const confirmation = page.getByTestId('signed-off-confirmation')
  await expect(confirmation).toContainText('Signed off')
  await expect(confirmation).toContainText('1 grant revoked')

  // The confirmation links to the control, where the new evidence is the newest item.
  await page.getByTestId('evidence-link').getByRole('link').click()
  await expect(page).toHaveURL(/\/evidence\/controls\/ctl_a_5_15$/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Access control')
  const items = page.getByTestId('evidence-item')
  await expect(items).toHaveCount(2)
  await expect(items.first()).toContainText(/Access review \d{4}-Q\d signed off/)
  await expect(items.first()).toContainText('1 revoked, 1 changed')
  await items
    .first()
    .getByRole('link', { name: /AR-002/ })
    .click()
  await expect(page).toHaveURL(/\/security\/access-reviews\/ar_/)
  await expect(page.getByTestId('signed-off-confirmation')).toBeVisible()
})

test('a revoke decision needs a reason, and the progress follows', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/security/access-reviews')
  await rows(page, 'Access reviews').filter({ hasText: 'AR-002' }).getByRole('link').click()
  const group = page.getByRole('radiogroup', {
    name: 'Decision for Kuya Dev Studio (vendor) on GitHub organisation',
  })
  await group.getByRole('radio', { name: 'Revoke' }).click()
  await page.getByRole('button', { name: 'Revoke access' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Say why' })).toContainText(
    'Say why access is being removed',
  )

  await page.getByLabel('Why is access being removed?').fill('The studio’s contract ended.')
  await page.getByRole('button', { name: 'Revoke access' }).click()
  await expect(page.getByTestId('review-progress')).toHaveText('7 of 11 decided')
  await expect(group.getByRole('radio', { name: 'Revoke' })).toHaveAttribute('aria-checked', 'true')

  // Clearing it puts the grant back to undecided.
  await page.getByRole('button', { name: /Clear the decision for Kuya/ }).click()
  await expect(page.getByTestId('review-progress')).toHaveText('6 of 11 decided')
})

test('starts a review from the active grants of the systems chosen', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/security/access-reviews/new')
  await page.getByLabel('Period').fill(`${new Date().getFullYear() + 1}-Q1`)
  await page.getByRole('checkbox', { name: /Payroll service/ }).check()
  await page.getByRole('checkbox', { name: /Newsletter mailer/ }).check()
  await page.getByRole('button', { name: 'Start review' }).click()
  await expect(page).toHaveURL(/\/security\/access-reviews\/ar_/)
  await expect(page.getByTestId('review-progress')).toHaveText('0 of 5 decided')
  await expect(page.getByTestId('review-item')).toHaveCount(5)
})

test('systems: the register, a system’s linked records and who has access', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/security/assets')
  await expect(rows(page, 'Systems')).toHaveCount(10)
  await page.getByRole('link', { name: 'GitHub organisation' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('GitHub organisation')
  const linked = page.getByTestId('linked-records')
  await expect(linked).toContainText('Access grants')
  await expect(linked).toContainText('Secrets')
  await expect(linked).toContainText('Changes')
  await expect(linked).toContainText('Decisions')
  await page.getByRole('link', { name: /Who has access \(5\)/ }).click()
  await expect(page).toHaveURL(/access\?system=sys_github/)
  await expect(page.getByTestId('grant-row')).toHaveCount(5)
})

test('systems: add, edit and delete', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/security/assets/new')
  await page.getByLabel('Name').fill('Staging environment')
  await page.getByLabel('Provider').fill('Microsoft Azure')
  await page.getByRole('button', { name: 'Add system' }).click()
  await expect(page).toHaveURL(/\/security\/assets\/sys_/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Staging environment')
  await expect(page.getByText('SYS-011').first()).toBeVisible()

  // A system that's still in use can't be deleted; an unused one can.
  await page.getByRole('button', { name: 'More actions' }).click()
  await page.getByRole('menuitem', { name: 'Delete system' }).click()
  await page.getByLabel(/Type “SYS-011”/).fill('SYS-011')
  await page.getByRole('button', { name: 'Delete SYS-011' }).click()
  await expect(page).toHaveURL(/\/security\/assets$/)
  await expect(rows(page, 'Systems')).toHaveCount(10)
})

test('access grants: by system, by person, add and revoke', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/security/access')
  await expect(page.getByTestId('access-group-sys_github').getByTestId('grant-row')).toHaveCount(5)

  await page.getByRole('button', { name: 'By person' }).click()
  await expect(page).toHaveURL(/view=person/)
  const ramil = page.getByTestId('access-group-ext:ramil torres (contractor)')
  await expect(ramil.getByTestId('grant-row')).toHaveCount(3)

  // Add access for a contractor, then revoke it.
  await page.getByRole('button', { name: 'By system' }).click()
  await page.getByRole('button', { name: 'Add access' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('System').click()
  await page.getByRole('option', { name: 'Office file server' }).click()
  await dialog.getByLabel('Someone outside the organisation').check()
  await dialog
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill('Tess Reyes (auditor’s IT contact)')
  await dialog.getByRole('button', { name: 'Add access' }).click()
  const nas = page.getByTestId('access-group-sys_nas')
  await expect(nas.getByTestId('grant-row')).toHaveCount(3)

  await nas.getByRole('button', { name: /Revoke Tess Reyes/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke access' }).click()
  await expect(nas.getByTestId('grant-row')).toHaveCount(2)
})

test('secrets: overdue first, never a value, and Mark rotated restarts the clock', async ({
  page,
}) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/security/secrets')
  await expect(page.getByRole('note').filter({ hasText: 'never its value' })).toBeVisible()
  const table = rows(page, 'Secret records')
  await expect(table).toHaveCount(8)
  await expect(table.nth(0)).toContainText('SCR-005')
  await expect(table.nth(0)).toContainText('Overdue 30 d')
  await expect(table.nth(1)).toContainText('Overdue 20 d')

  await page.getByRole('button', { name: 'Mark Hostinger SFTP password rotated' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Mark rotated' }).click()
  await expect(table.filter({ hasText: 'SCR-005' })).toContainText('Due in 90 d')
  await expect(table.nth(0)).toContainText('SCR-002')

  // The add form asks where a secret lives and has no field for its value.
  await page.getByRole('button', { name: 'Add secret record' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Where it is stored')).toBeVisible()
  await expect(dialog.getByLabel(/value|password|token/i)).toHaveCount(0)
})

test('changes: an overdue emergency review is flagged and can be recorded', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/security/changes')
  const overdue = rows(page, 'Changes').filter({ hasText: 'CHG-012' })
  await expect(overdue).toContainText('Review overdue')
  await expect(rows(page, 'Changes').filter({ hasText: 'CHG-009' })).toContainText('Reviewed')
  await expect(rows(page, 'Changes').filter({ hasText: 'CHG-015' })).toContainText('Review due')

  await page.getByRole('button', { name: 'Add review note to CHG-012' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Review note').fill('ok')
  await dialog.getByRole('button', { name: 'Record review' }).click()
  await expect(dialog).toContainText('Write what was reviewed')
  await dialog
    .getByLabel('Review note')
    .fill('Rolled back cleanly. The migration script was fixed in CHG-013.')
  await dialog.getByRole('button', { name: 'Record review' }).click()
  await expect(overdue).toContainText('Reviewed')
})

test('changes: log one, with an approver unless it is an emergency', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/security/changes')
  await page.getByRole('button', { name: 'Log a change' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('System').click()
  await page.getByRole('option', { name: 'Office file server' }).click()
  await dialog.getByLabel('What changed').fill('Replace the failed disk')
  await dialog.getByLabel('Rollback plan').fill('Reinstall the old disk.')
  await dialog.getByRole('button', { name: 'Log change' }).click()
  await expect(dialog).toContainText('Choose who approved it')
  await dialog.getByRole('switch').click()
  await dialog.getByRole('button', { name: 'Log change' }).click()
  const row = rows(page, 'Changes').filter({ hasText: 'CHG-016' })
  await expect(row).toContainText('Replace the failed disk')
  await expect(row).toContainText('Review due')
})

test('risks: the heat map filters the register, on inherent or residual ratings', async ({
  page,
}) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/security/risks')
  await expect(rows(page, 'Risks')).toHaveCount(12)
  await page.getByRole('button', { name: 'Likelihood 3, impact 5: 2 risks' }).click()
  await expect(page).toHaveURL(/cell=3x5/)
  await expect(rows(page, 'Risks')).toHaveCount(2)
  await expect(rows(page, 'Risks').first()).toContainText('RISK-')

  // Same cell again clears the filter.
  await page.getByRole('button', { name: 'Likelihood 3, impact 5: 2 risks' }).click()
  await expect(rows(page, 'Risks')).toHaveCount(12)

  // Residual view: two risks sit at 2 × 5 after treatment.
  await page
    .getByRole('group', { name: 'Rating shown' })
    .getByRole('button', { name: 'residual' })
    .click()
  await expect(page).toHaveURL(/basis=residual/)
  await page.getByRole('button', { name: 'Likelihood 2, impact 5: 2 risks' }).click()
  await expect(rows(page, 'Risks')).toHaveCount(2)
  await expect(rows(page, 'Risks').first()).toContainText('10 · High')
})

test('risks: add one, rate it and link a policy and a control', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/security/risks/new')
  await page.getByRole('textbox', { name: 'Risk', exact: true }).fill('Vendor outage stops payroll')
  await page.getByRole('checkbox', { name: 'Rate the residual risk' }).check()
  await page.getByRole('button', { name: 'Add risk' }).click()
  await expect(page).toHaveURL(/\/security\/risks\/risk_/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Vendor outage stops payroll')
  await expect(page.getByText('RISK-013').first()).toBeVisible()
  const linked = page.getByTestId('linked-records')
  await linked.getByRole('button', { name: 'Link existing' }).click()
  await page.getByRole('menuitem', { name: 'Policy' }).click()
  await page
    .getByRole('dialog')
    .getByPlaceholder(/Search/)
    .fill('ITD-014')
  await page
    .getByRole('dialog')
    .getByRole('option', { name: /Vendor/ })
    .click()
  await expect(linked).toContainText('ITD-014')
})

test('decisions: supersede an accepted decision', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/security/decisions/adr_001')
  await page.getByRole('link', { name: 'Supersede' }).click()
  await expect(page).toHaveURL(/decisions\/new\?supersedes=adr_001/)
  await page.getByLabel('Title').fill('Use Azure Key Vault with HSM-backed keys')
  await page
    .getByLabel('Context')
    .fill('The auditor asked for hardware-backed keys for production secrets.')
  await page.getByRole('button', { name: 'Save and supersede' }).click()
  await expect(page).toHaveURL(/\/security\/decisions\/adr_/)
  await expect(page.getByText('ADR-005').first()).toBeVisible()

  await page.goto('/3rdloop/security/decisions/adr_001')
  await expect(page.getByTestId('superseded-banner')).toContainText('superseded by ADR-005')
  // A superseded decision is a record: no Edit, no Supersede.
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Supersede' })).toHaveCount(0)
})

test('permissions: staff are refused', async ({ page }) => {
  await signInAs(page, USERS.staff, '/3rdloop/security/secrets')
  await expect(page.getByRole('heading', { name: 'You don’t have access to this' })).toBeVisible()
})

test('permissions: auditors read the registers without writing', async ({ page }) => {
  await signInAs(page, USERS.auditor, '/3rdloop/security/secrets')
  await expect(rows(page, 'Secret records')).toHaveCount(8)
  await expect(page.getByRole('button', { name: 'Add secret record' })).toHaveCount(0)
  await page.goto('/3rdloop/security/changes')
  await expect(rows(page, 'Changes').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log a change' })).toHaveCount(0)
})

test('permissions: approvers read a review but cannot decide or sign it off', async ({ page }) => {
  await signInAs(page, USERS.michael, '/3rdloop/security/access-reviews')
  await rows(page, 'Access reviews').filter({ hasText: 'AR-002' }).getByRole('link').click()
  await expect(page.getByTestId('review-progress')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign off review' })).toHaveCount(0)
  await expect(page.getByRole('radiogroup')).toHaveCount(0)
})

test('Starter plans see the upgrade card, not the security registers', async ({ page }) => {
  await signInAs(page, USERS.clinicDpo, '/sample-clinic/security/risks')
  await expect(page.getByRole('heading', { level: 1, name: 'Risks' })).toBeVisible()
  await expect(page.getByText(/Included in the Pro plan/)).toBeVisible()
})

test('search finds secrets, changes and decisions by ID', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/search?q=ADR-004')
  await expect(page.getByTestId('search-group-decision')).toContainText('Azure Static Web Apps')
  await page.getByLabel('Search records').fill('SCR-002')
  await expect(page.getByTestId('search-group-secret_record')).toContainText(
    'GitHub Actions deploy token',
  )
  await page.getByTestId('search-result').first().click()
  await expect(page).toHaveURL(/\/security\/secrets\?q=SCR-002/)
  await expect(rows(page, 'Secret records')).toHaveCount(1)
})
