import fs from 'node:fs'
import { expect, test } from '@playwright/test'
import { parseCsv, readXlsx } from '@/mocks/tabular'
import { resetMockDb, signInAs, USERS } from './helpers'

test.beforeEach(async ({ page }) => {
  await resetMockDb(page)
})

const CSV = [
  'Ref,Control area,Question,Your response',
  '1,Access,Is multi-factor authentication required for all accounts?,',
  '2,Backup,Are production databases backed up daily?,',
  '3,Insurance,Do you carry cyber liability insurance?,',
].join('\r\n')

test('upload a CSV, map columns, review with the keyboard and export', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/questionnaires')
  await page.getByRole('link', { name: 'Upload questionnaire' }).first().click()
  await page.getByLabel('Name').fill('Annual vendor review')
  await page.getByLabel('Client').fill('Example Client Inc.')
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'vendor-review.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })
  await page.getByRole('button', { name: 'Upload and continue' }).click()

  // Mapping: the likely columns are preselected.
  await expect(page.getByRole('heading', { name: 'Choose the columns' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Questions are in' })).toHaveText(/C · Question/)
  await expect(page.getByRole('combobox', { name: 'Answers go in' })).toHaveText(
    /D · Your response/,
  )
  await page.getByRole('button', { name: 'Draft answers' }).click()
  await expect(page.getByText('Drafted 3 answers. 1 needs your input.')).toBeVisible()

  const grid = page.getByRole('grid', { name: 'Answers' })
  const rows = grid.locator('tbody tr')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Multi-factor authentication')
  await expect(rows.nth(0).locator('a.citation-link').first()).toBeVisible()
  await expect(rows.nth(2)).toContainText('Needs input')

  // ↓ moves, ⌘/Ctrl Enter approves and moves on, Enter edits.
  await rows.nth(0).focus()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(rows.nth(0)).toHaveAttribute('data-status', 'approved')
  await expect(rows.nth(1)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(rows.nth(2)).toBeFocused()
  await page.keyboard.press('Enter')
  const editor = page.getByLabel('Answer to question 3')
  await expect(editor).toBeFocused()
  await editor.fill('Yes. We hold a cyber liability policy; details on request.')
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(rows.nth(2)).toHaveAttribute('data-status', 'approved')
  await expect(page.getByLabel('Progress')).toContainText('2 of 3 answers approved')

  // Esc cancels an edit without saving.
  await rows.nth(1).focus()
  await page.keyboard.press('Enter')
  await page.getByLabel('Answer to question 2').fill('Throw this away')
  await page.keyboard.press('Escape')
  await expect(rows.nth(1)).toHaveAttribute('data-status', 'draft')
  await expect(rows.nth(1)).toBeFocused()

  // Filters live in the URL.
  await page.getByRole('button', { name: /Filter by status/ }).click()
  await page.getByRole('menuitemcheckbox', { name: 'Draft' }).click()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/status=draft/)
  await expect(rows).toHaveCount(1)

  // Export: the client's file, same columns, answers filled in, markers removed.
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('vendor-review (answered).csv')
  const out = parseCsv(fs.readFileSync((await file.path()) ?? '', 'utf8').replace(/^﻿/, ''))
  expect(out[0]).toEqual(['Ref', 'Control area', 'Question', 'Your response'])
  expect(out[3]?.[3]).toBe('Yes. We hold a cyber liability policy; details on request.')
  expect(out[1]?.[3]).toContain('Multi-factor authentication')
  expect(out[1]?.[3]).not.toMatch(/\[\d\]/)
})

test('the seeded Excel questionnaire exports as Excel', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/questionnaires')
  await page.getByRole('link', { name: 'Vendor security assessment 2026' }).click()
  await expect(page.getByLabel('Progress')).toContainText('4 of 12 answers approved')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export XLSX' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe(
    'Harbor Point vendor security assessment 2026 (answered).xlsx',
  )
  const { sheetName, rows } = readXlsx(fs.readFileSync((await file.path()) ?? ''))
  expect(sheetName).toBe('Assessment')
  expect(rows[0]).toEqual(['#', 'Domain', 'Question', 'Vendor response', 'Comments'])
  expect(rows[1]?.[3]).toContain('Multi-factor authentication')
})

test('approvers can read and export but not edit', async ({ page }) => {
  await signInAs(page, USERS.michael, '/3rdloop/questionnaires/qnr_seed_1')
  const grid = page.getByRole('grid', { name: 'Answers' })
  await expect(grid).toBeVisible()
  await expect(grid.getByRole('button', { name: /Edit answer/ })).toHaveCount(0)
  await grid.locator('tbody tr').nth(6).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Answer to question 7')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Export XLSX' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Upload questionnaire' })).toHaveCount(0)
})

test('Starter sees the upgrade card', async ({ page }) => {
  await signInAs(page, USERS.clinicDpo, '/sample-clinic/questionnaires')
  await expect(page.getByTestId('upgrade-card')).toContainText('Included in the Pro plan.')
})

test('unsupported files are refused before upload', async ({ page }) => {
  await signInAs(page, USERS.jehnsen, '/3rdloop/questionnaires/upload')
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') })
  await expect(page.getByText('notes.pdf isn’t a CSV or Excel (.xlsx) file.')).toBeVisible()
})

test.describe('small screens', () => {
  test.use({ viewport: { width: 360, height: 740 } })

  test('Ask and questionnaire pages never scroll sideways at 360px', async ({ page }) => {
    await signInAs(page, USERS.jehnsen, '/3rdloop/ask')
    for (const path of [
      '/3rdloop/ask',
      '/3rdloop/ask/thr_seed_1',
      '/3rdloop/questionnaires',
      '/3rdloop/questionnaires/upload',
      '/3rdloop/questionnaires/qnr_seed_1',
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
