import { expect, test } from '@playwright/test'
import { mainNav, resetMockDb, signInAs, USERS } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetMockDb(page)
})

test.describe('role-appropriate navigation', () => {
  test('admin sees every area, including Members and the audit log', async ({ page }) => {
    await signInAs(page, USERS.jehnsen, '/3rdloop')
    const nav = mainNav(page)
    for (const name of [
      'Policy library',
      'Processing records',
      'Systems',
      'Controls',
      'Ask',
      'Questionnaires',
      'Provider keys',
      'Members',
      'Audit log',
    ]) {
      await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
    }
  })

  test('staff only see policies, Ask and their own settings', async ({ page }) => {
    await signInAs(page, USERS.staff)
    const nav = mainNav(page)
    await expect(nav.getByRole('link', { name: 'My policies' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Notifications' })).toBeVisible()
    for (const name of ['Processing records', 'Systems', 'Controls', 'Members', 'Questionnaires']) {
      await expect(nav.getByRole('link', { name })).toHaveCount(0)
    }
    // Every role can report an incident from the top bar.
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'Report an incident' }),
    ).toBeVisible()
  })

  test('auditors get read-only areas without admin settings', async ({ page }) => {
    await signInAs(page, USERS.auditor)
    const nav = mainNav(page)
    await expect(nav.getByRole('link', { name: 'Controls' })).toBeVisible()
    for (const name of ['Members', 'Questionnaires', 'My policies']) {
      await expect(nav.getByRole('link', { name })).toHaveCount(0)
    }
    await expect(page.getByRole('link', { name: 'Report an incident' })).toHaveCount(0)
  })

  test('a 403 page explains the missing permission', async ({ page }) => {
    await signInAs(page, USERS.staff)
    await page.goto('/3rdloop/settings/members')
    await expect(page.getByRole('heading', { name: 'You don’t have access to this' })).toBeVisible()
    await expect(page.getByText('“manage members”')).toBeVisible()
  })
})

test('switches organisations and shows locked items on Starter', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop')
  await page.getByTestId('org-switcher').click()
  await page.getByRole('menuitem', { name: /Sample Clinic/ }).click()
  await expect(page).toHaveURL('/sample-clinic')
  await expect(page.getByTestId('org-switcher')).toHaveAccessibleName(/Sample Clinic/)

  const nav = mainNav(page)
  const systems = nav.getByRole('link', { name: 'Systems' })
  await expect(systems).toHaveAttribute('data-locked', 'true')
  await expect(nav.getByRole('link', { name: 'Processing records' })).not.toHaveAttribute(
    'data-locked',
  )
  await systems.click()
  await expect(page).toHaveURL('/sample-clinic/security/assets')
  await expect(page.getByTestId('upgrade-card')).toContainText('Included in the Pro plan.')

  await page.goto('/sample-clinic/ai-governance')
  await expect(page.getByTestId('upgrade-card')).toContainText('Included in the Premium plan.')
})

test('non-members get a 404, not the org', async ({ page }) => {
  await signInAs(page, USERS.clinicStaff)
  await page.goto('/3rdloop')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

test('command palette jumps to pages and sends questions to Ask', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop')
  await page.keyboard.press('Control+k')
  const input = page.getByPlaceholder('Type a page, record ID, or a question…')
  await expect(input).toBeFocused()
  await input.fill('risks')
  await page.getByRole('option', { name: /Risks/ }).click()
  await expect(page).toHaveURL('/3rdloop/security/risks')

  await page.getByRole('button', { name: /Search or jump to/ }).click()
  await input.fill('who approves access changes?')
  await page.getByRole('option', { name: /Ask: who approves access changes\?/ }).click()
  // The question opens in the Quick Ask panel (M7) instead of navigating away.
  await expect(page.getByRole('dialog', { name: 'Ask' })).toBeVisible()
  await expect(
    page.getByRole('dialog', { name: 'Ask' }).getByText('who approves access changes?'),
  ).toBeVisible()
})

test('theme toggle switches to dark and persists', async ({ page }) => {
  await signInAs(page, USERS.michael)
  await page.getByTestId('user-menu').click()
  await page.getByRole('menuitemradio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('notifications bell shows unread items and marks them read', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop')
  const bell = page.getByRole('button', { name: /Notifications \(2 unread\)/ })
  await bell.click()
  await expect(page.getByText('DSR-2026-0012 is due in 2 days')).toBeVisible()
  await page.getByRole('button', { name: 'Mark all as read' }).click()
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
})

test('the sample data banner can be dismissed', async ({ page }) => {
  await signInAs(page, USERS.staff)
  const banner = page.getByTestId('sample-data-banner')
  await expect(banner).toBeVisible()
  await banner.getByRole('button', { name: 'Dismiss' }).click()
  await expect(banner).toHaveCount(0)
})

test.describe('small screens', () => {
  test.use({ viewport: { width: 360, height: 740 } })

  test('the sidebar becomes a drawer and the page never scrolls sideways', async ({ page }) => {
    await signInAs(page, USERS.jehnsen, '/3rdloop')
    await expect(mainNav(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await mainNav(page).getByRole('link', { name: 'Risks' }).click()
    await expect(page).toHaveURL('/3rdloop/security/risks')
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
