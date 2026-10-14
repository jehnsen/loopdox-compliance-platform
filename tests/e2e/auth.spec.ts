import { expect, test } from '@playwright/test'
import { resetMockDb, signInAs, USERS } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetMockDb(page)
})

test('redirects signed-out users to login and back to where they were going', async ({ page }) => {
  await page.goto('/3rdloop/policies')
  await expect(page).toHaveURL(/\/login\?next=%2F3rdloop%2Fpolicies/)
  await page.getByTestId(`sign-in-as-${USERS.staff}`).click()
  await expect(page).toHaveURL('/3rdloop/policies')
  await expect(page.getByRole('heading', { level: 1, name: 'Policy library' })).toBeVisible()
})

const landing: [string, string, string][] = [
  [USERS.jehnsen, '/select-org', 'Jehnsen Enrique'],
  [USERS.michael, '/3rdloop', 'Michael Manabat'],
  [USERS.staff, '/3rdloop', 'Staff Member'],
  [USERS.auditor, '/3rdloop', 'External Auditor'],
  [USERS.clinicDpo, '/sample-clinic', 'Dra. Liza Santos'],
  [USERS.clinicStaff, '/sample-clinic', 'Clinic Front Desk'],
]

for (const [email, path, name] of landing) {
  test(`signs in as ${name}`, async ({ page }) => {
    await signInAs(page, email)
    await expect(page).toHaveURL(path)
    if (path === '/select-org') {
      await page.getByRole('link', { name: /3rdLoop Solutions Corp\./ }).click()
      await expect(page).toHaveURL('/3rdloop')
    }
    await expect(page.getByTestId('user-menu')).toHaveAccessibleName(new RegExp(name))
  })
}

test('signs in with email and password, and shows a clear error for a wrong password', async ({
  page,
}) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(USERS.michael)
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'don’t match an account' })).toBeVisible()
  await page.getByLabel('Password').fill('loopdox-demo')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL('/3rdloop')
})

test('keeps tokens out of JavaScript', async ({ page, context }) => {
  await signInAs(page, USERS.staff)
  const cookies = await context.cookies()
  const session = cookies.filter((c) => c.name.startsWith('loopdox_session'))
  expect(session).toHaveLength(2)
  for (const c of session) expect(c.httpOnly).toBe(true)
  expect(await page.evaluate(() => document.cookie)).not.toContain('loopdox_session')
})

test('signs out and protects pages again', async ({ page }) => {
  await signInAs(page, USERS.staff)
  await page.getByTestId('user-menu').click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL('/login')
  await page.goto('/3rdloop')
  await expect(page).toHaveURL(/\/login\?next=/)
})

test('forgot and reset password flows', async ({ page }) => {
  await page.goto('/forgot-password')
  await page.getByLabel('Email').fill('staff@3rdloop.example')
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('status')).toContainText('reset link is on its way')

  await page.goto('/reset-password?token=demo-reset-token')
  await page.getByLabel('New password', { exact: true }).fill('a-much-longer-password')
  await page.getByLabel('Confirm new password').fill('different-password-x')
  await page.getByRole('button', { name: 'Save new password' }).click()
  await expect(page.getByText('The passwords don’t match.')).toBeVisible()
  await page.getByLabel('Confirm new password').fill('a-much-longer-password')
  await page.getByRole('button', { name: 'Save new password' }).click()
  await expect(page.getByRole('status')).toContainText('Password changed')
})

test('accepts an invite and lands in the organisation', async ({ page }) => {
  await page.goto('/accept-invite/demo-invite-token')
  await expect(page.getByText('new.hire@3rdloop.example')).toBeVisible()
  await page.getByLabel('Full name').fill('New Hire')
  await page.getByLabel('Password', { exact: true }).fill('a-much-longer-password')
  await page.getByLabel('Confirm new password').fill('a-much-longer-password')
  await page.getByRole('button', { name: 'Accept invite and continue' }).click()
  await expect(page).toHaveURL('/3rdloop')
  await expect(page.getByTestId('user-menu')).toHaveAccessibleName(/New Hire/)
})
