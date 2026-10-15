import { expect, test, type Page } from '@playwright/test'
import { formatCalendarDate } from '@/lib/utils/dates'
import { resetMockDb, signInAs, USERS } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetMockDb(page)
})

async function askQuestion(page: Page, question: string) {
  const box = page.getByLabel('Your question').last()
  await box.fill(question)
  await box.press('Enter')
}

test('M7: streams a cited answer token by token and saves the conversation', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/ask')
  await askQuestion(page, 'What does the Access Control Policy require for MFA?')

  // While streaming, the answer is busy and its text grows.
  const streaming = page.locator('[data-testid="answer"][aria-busy="true"]')
  await expect(streaming).toBeVisible()
  await expect(streaming).toContainText(/\w+/)
  const partial = (await streaming.textContent()) ?? ''

  const answer = page.getByTestId('answer').last()
  await expect(answer).toHaveAttribute('aria-busy', 'false')
  await expect(answer).toContainText(
    'Multi-factor authentication is mandatory on every account that supports it.',
  )
  const full = (await answer.textContent()) ?? ''
  expect(full.length).toBeGreaterThan(partial.length)

  // Numbered superscript citation, and the sources panel lists it.
  await expect(answer.locator('a.citation-link').first()).toHaveText('1')
  const sources = page.getByRole('list', { name: 'Sources for the selected answer' })
  await expect(sources).toContainText('ITD-007 Access Control Policy › 3.2 Authentication')

  // The conversation got its own URL and appears in the list.
  await expect(page).toHaveURL(/\/3rdloop\/ask\/thr_/)
  await expect(
    page
      .getByRole('navigation', { name: 'Conversations' })
      .getByRole('button', { name: /require for MFA/ })
      .first(),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('answer').last()).toContainText(
    'Multi-factor authentication is mandatory',
  )
})

test('M7: a citation opens the exact policy section', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/ask')
  await askQuestion(page, 'What does the Access Control Policy require for MFA?')
  const link = page.getByTestId('answer').last().locator('a.citation-link').first()
  await expect(link).toHaveAccessibleName(
    'Source 1: ITD-007 Access Control Policy › 3.2 Authentication',
  )
  await link.click()
  // v3 is in review, so the answer quoted the approved v2, and the link opens v2.
  await expect(page).toHaveURL('/3rdloop/policies/doc_itd_007/versions/2#32-authentication')
  const heading = page.getByRole('heading', { name: '3.2 Authentication' })
  await expect(heading).toBeInViewport()
  await expect(heading).toHaveAttribute('data-cited', 'true')
})

test('M7: an answer without sources renders as “couldn’t find”', async ({ page }) => {
  await signInAs(page, USERS.staff, '/3rdloop/ask')
  await askQuestion(page, 'What is the guest Wi-Fi password at the Cebu office?')
  const notFound = page.getByTestId('answer-not-found')
  await expect(notFound).toContainText('I couldn’t find this in your approved documents.')
  await expect(page.getByTestId('answer').last().locator('a.citation-link')).toHaveCount(0)
  // A suggestion asks a question the policies can answer.
  await notFound
    .getByRole('button', { name: 'How quickly must we notify the NPC of a breach?' })
    .click()
  await expect(page.getByTestId('answer').last()).toContainText('72 hours')
})

test('M7: Starter shows its meter, locks Records and Impact, and hits the cap', async ({
  page,
}) => {
  await page.request.post('/api/mock/usage', { data: { org: 'sample-clinic', askQuestions: 99 } })
  await signInAs(page, USERS.clinicStaff, '/sample-clinic/ask')
  await expect(page.getByTestId('ask-meter')).toContainText('99 of 100 questions this month')
  await expect(page.getByRole('radio', { name: /Records/ })).toHaveAttribute(
    'aria-disabled',
    'true',
  )
  await expect(page.getByRole('radio', { name: /Impact/ })).toHaveAttribute('aria-disabled', 'true')

  await askQuestion(page, 'What do I do if patient information is lost?')
  await expect(page.getByTestId('answer').last()).toContainText('72 hours')
  // The 100th question used the last one: the composer becomes the upgrade card.
  const capped = page.getByTestId('ask-capped')
  await expect(capped).toContainText('You’ve used all 100 questions this month')
  await expect(capped.getByTestId('upgrade-card')).toContainText('Included in the Pro plan.')
  await expect(page.getByLabel('Your question')).toHaveCount(0)
})

test('Quick Ask from a policy page suggests questions about it and closes on a citation', async ({
  page,
}) => {
  await signInAs(page, USERS.staff, '/3rdloop/policies/doc_itd_007')
  await page.getByRole('banner').getByRole('button', { name: 'Ask' }).click()
  const panel = page.getByRole('dialog', { name: 'Ask' })
  await panel.getByRole('button', { name: 'What does this policy require for MFA?' }).click()
  const answer = panel.getByTestId('answer').last()
  await expect(answer).toContainText('Multi-factor authentication is mandatory')
  await answer.locator('a.citation-link').first().click()
  await expect(panel).toHaveCount(0)
  await expect(page).toHaveURL(/#32-authentication$/)
})

test('the command palette sends a question to Quick Ask', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop')
  await page.keyboard.press('ControlOrMeta+k')
  await page
    .getByPlaceholder('Type a page, record ID, or a question…')
    .fill('How long are backups kept?')
  await page.getByRole('option', { name: /Ask: How long are backups kept\?/ }).click()
  const panel = page.getByRole('dialog', { name: 'Ask' })
  await expect(panel.getByTestId('answer').last()).toContainText('kept for 35 days')
})

test('history mode answers from the version in force on a past date', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/ask')
  const res = await page.request.get('/api/v1/orgs/3rdloop/documents/doc_itd_007')
  const doc = (await res.json()) as { workflow: { type: string; version: number; at: string }[] }
  const v2 = doc.workflow.find((w) => w.type === 'approve' && w.version === 2)
  const before = new Date(Date.parse(v2?.at ?? '') - 10 * 86_400_000).toISOString().slice(0, 10)

  await page.getByRole('button', { name: 'As of…' }).click()
  await page.getByLabel('As of', { exact: true }).fill(before)
  await askQuestion(page, 'What does the Access Control Policy say about privileged access?')
  const answer = page.getByTestId('answer').last()
  await expect(answer).toContainText(`As of ${formatCalendarDate(before)}`)
  await expect(answer).toContainText('Privileged access needs CTO approval.')
  await expect(
    page
      .getByRole('list', { name: 'Sources for the selected answer' })
      .getByLabel('Version 1')
      .first(),
  ).toBeVisible()
})

test('feedback, new conversations and deleting a conversation', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/ask/thr_seed_1')
  await expect(page.getByTestId('answer')).toHaveCount(2)
  const second = page.getByTestId('answer').nth(1)
  await second.getByRole('button', { name: 'Bad answer' }).click()
  await page
    .getByLabel('What was wrong? (optional)')
    .fill('It should mention the 24-hour client notice.')
  await page.getByRole('button', { name: 'Send feedback' }).click()
  await expect(page.getByText('Thanks. Your feedback helps improve Ask.')).toBeVisible()
  await expect(second.getByRole('button', { name: 'Bad answer' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  const threads = page.getByRole('navigation', { name: 'Conversations' })
  await threads.getByRole('button', { name: 'New conversation' }).click()
  await expect(page).toHaveURL('/3rdloop/ask')
  await expect(
    page.getByRole('heading', { name: 'Ask about your policies and records' }),
  ).toBeVisible()

  await threads
    .getByRole('button', { name: /Options for/ })
    .first()
    .click()
  await page.getByRole('menuitem', { name: 'Delete conversation' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete conversation' }).click()
  await expect(page.getByText('Conversation deleted')).toBeVisible()
  await expect(threads.getByText('Your conversations appear here.')).toBeVisible()
})

test('?q= from the overview Ask box asks immediately', async ({ page }) => {
  await signInAs(
    page,
    USERS.staff,
    '/3rdloop/ask?q=Can%20I%20paste%20client%20data%20into%20ChatGPT%3F',
  )
  await expect(page.getByTestId('answer').last()).toContainText('public AI tools')
  await expect(page.getByTestId('answer')).toHaveCount(1)
})
