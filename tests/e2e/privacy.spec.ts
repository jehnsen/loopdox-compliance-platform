import { expect, test, type Page } from '@playwright/test'
import { formatDateTimeZone, toZonedInputValue } from '@/lib/utils/dates'
import { resetMockDb, signInAs, USERS } from './helpers'

const TZ = 'Asia/Manila'
const HOUR = 3_600_000

test.beforeEach(async ({ page }) => {
  await resetMockDb(page)
})

function clock(page: Page) {
  return page.getByTestId('countdown-clock')
}

test('M3 acceptance: report a breach → clock → linked notices → approver sign-off → NPC notified stops the clock', async ({
  page,
}) => {
  // Report a breach with personal data, discovered 2 hours ago (Manila time).
  const discovered = new Date(Date.now() - 2 * HOUR)
  discovered.setSeconds(0, 0)
  await signInAs(page, USERS.jehnsen, '/3rdloop/privacy/incidents/report')
  await page.getByLabel('What happened, in a few words').fill('Shared drive link sent to a client')
  await page
    .getByRole('textbox', { name: 'What happened', exact: true })
    .fill('A link to the client project folder was sent to the wrong client contact.')
  await page
    .getByLabel('When was it discovered?')
    .fill(toZonedInputValue(discovered.toISOString(), TZ))
  await page.getByLabel('What’s affected?').fill('Client project folder')
  await page.getByRole('radio', { name: /^Yes/ }).check()
  await page.getByRole('button', { name: 'Report incident' }).click()
  await expect(page).toHaveURL(/\/3rdloop\/privacy\/incidents\/inc_/)
  const incidentPath = new URL(page.url()).pathname

  // The clock starts at discoveredAt + 72 h.
  const deadline = new Date(discovered.getTime() + 72 * HOUR).toISOString()
  await expect(clock(page)).toHaveAttribute('data-phase', 'running')
  await expect(clock(page)).toContainText(formatDateTimeZone(deadline, TZ))
  await expect(clock(page)).toContainText('Decide whether notification is required')
  await expect(page.getByRole('timer')).toHaveAccessibleName(
    /^2 d 2[12] h \d+ min left to notify the NPC$/,
  )

  // Link the processing record, then accept a suggested system from its links.
  await page.getByRole('button', { name: 'Link existing' }).click()
  await page.getByRole('menuitem', { name: 'Processing record' }).click()
  const picker = page.getByRole('dialog')
  await picker.getByPlaceholder(/Search processing records/).fill('PA-002')
  await picker.getByRole('option', { name: /Client project delivery/ }).click()
  await expect(page.getByTestId('linked-records')).toContainText('Client project delivery')
  await page
    .getByTestId('link-suggestions')
    .getByRole('listitem')
    .filter({ hasText: 'Client project database' })
    .getByRole('button', { name: 'Link' })
    .click()
  await expect(page.getByTestId('linked-records')).toContainText('Client project database')

  // Triage: notification is required.
  await page.getByLabel('People affected').fill('120')
  await page.getByRole('radio', { name: /^Yes: notify/ }).check()
  await page
    .getByLabel('Why', { exact: true })
    .fill('Customer contact details reached an outside party.')
  await page.getByRole('button', { name: 'Save triage' }).click()
  await expect(clock(page)).not.toContainText('Decide whether notification is required')

  // Notices are pre-filled from the linked records.
  await page.getByRole('button', { name: 'Draft notices' }).click()
  const npc = page.getByTestId('notice-npc')
  await expect(npc).toHaveValue(/PA-002 Client project delivery/)
  await expect(npc).toHaveValue(/Health information held in client systems/)
  await expect(npc).toHaveValue(/Systems involved: Client project database/)
  await expect(npc).toHaveValue(/Number of data subjects affected: about 120/)
  await expect(page.getByTestId('notices-status')).toContainText('Not signed off yet')
  await expect(page.getByRole('button', { name: 'Record NPC notification' })).toHaveCount(0)

  // The approver signs off.
  await signInAs(page, USERS.michael, incidentPath)
  await page.getByRole('button', { name: 'Sign off notices' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Sign off notices' }).click()
  await expect(page.getByTestId('notices-status')).toContainText('Signed off by Michael Manabat')

  // Recording the NPC notification stops the clock.
  await signInAs(page, USERS.jehnsen, incidentPath)
  await page.getByRole('button', { name: 'Record NPC notification' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('NPC reference').fill('NPC-BN-2042')
  await dialog.getByRole('button', { name: 'Record NPC notification' }).click()
  await expect(clock(page)).toHaveAttribute('data-phase', 'notified')
  await expect(clock(page)).toContainText('Notified at')
  await expect(clock(page)).toContainText('before the deadline')
  await expect(page.getByRole('main').getByText('Notified', { exact: true }).first()).toBeVisible()
  await expect(page.getByTestId('notified-npc')).toContainText('NPC-BN-2042')
})

test('staff can report an incident and get a receipt, but not open the register', async ({
  page,
}) => {
  await signInAs(page, USERS.staff, '/3rdloop')
  await page.waitForLoadState('networkidle')
  await page.getByRole('main').getByRole('link', { name: 'Report an incident' }).click()
  await page.getByLabel('What happened, in a few words').fill('Phishing email with a login link')
  await page
    .getByRole('textbox', { name: 'What happened', exact: true })
    .fill('I clicked a link and typed my password.')
  await page.getByRole('radio', { name: /^Not sure yet/ }).check()
  await page.getByRole('button', { name: 'Report incident' }).click()
  const receipt = page.getByTestId('incident-receipt')
  await expect(receipt).toContainText(/INC-\d{4}-0004/)
  await expect(receipt).toContainText('72-hour clock')
  await page.goto('/3rdloop/privacy/incidents')
  await expect(page.getByRole('heading', { name: 'You don’t have access to this' })).toBeVisible()
})

test('requester details stay masked until a permitted role reveals them', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/privacy/requests/dsr_2026_0012')
  await page.waitForLoadState('networkidle')
  const values = page.getByTestId('sensitive-value')
  await expect(values.nth(1)).toHaveText('m••••@mail.example')
  await page.getByRole('button', { name: 'Reveal requester contact' }).click()
  await expect(values.nth(1)).toHaveText('mcdelacruz@mail.example')
  await expect(page.getByText(/Hides in \d+ s/)).toBeVisible()
  await page.getByRole('button', { name: 'Hide requester contact' }).click()
  await expect(values.nth(1)).toHaveText('m••••@mail.example')

  await signInAs(page, USERS.michael, '/3rdloop/privacy/requests/dsr_2026_0012')
  await expect(page.getByRole('button', { name: /^Reveal/ })).toHaveCount(0)
  await expect(page.getByText('Masked').first()).toBeVisible()
})

test('PIA wizard saves each step and signs off', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/privacy/pia/new?processing=pa_001')
  await page.getByLabel('Scope').fill('Payroll processing by the outsourced payroll provider.')
  await page.getByRole('button', { name: 'Start assessment' }).click()
  await expect(page).toHaveURL(/step=2/)
  await page.getByLabel('Collection').fill('Employees submit details during onboarding.')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/step=3/)
  await page
    .getByRole('textbox', { name: 'Risk 1' })
    .fill('The provider is breached and government IDs leak.')
  await expect(page.getByTestId('risk-matrix')).toBeVisible()
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/step=4/)
  await page
    .getByLabel('Mitigation for risk 1')
    .fill('Contract requires encryption and breach notice in 24 h.')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  await expect(page).toHaveURL(/step=5/)
  await page.getByRole('button', { name: 'Sign off assessment' }).click()
  await expect(
    page.getByRole('main').getByText('Signed off', { exact: true }).first(),
  ).toBeVisible()
  await expect(page.getByRole('table', { name: 'Risks and mitigations' })).toContainText('breached')
})
