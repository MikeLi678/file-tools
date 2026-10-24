import { test, expect } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// package.json 是 type: module，沒有 __dirname
const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => join(here, '../fixtures', name)

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /合併 PDF/ }).click()
})

test('加密的 PDF 顯示密碼保護的訊息', async ({ page }) => {
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('encrypted.pdf')])
  await expect(page.getByRole('alert')).toContainText('此 PDF 有密碼保護，無法處理')
  await expect(page.getByTestId('page-tile')).toHaveCount(0)
})

test('損壞的 PDF 顯示無法讀取的訊息', async ({ page }) => {
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('corrupt.pdf')])
  await expect(page.getByRole('alert')).toContainText('此檔案無法讀取，可能已損壞')
})

test('零頁的 PDF 顯示沒有頁面的訊息', async ({ page }) => {
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('empty.pdf')])
  await expect(page.getByRole('alert')).toContainText('此 PDF 沒有任何頁面')
})

test('一批裡混了壞檔時，好檔仍然載入', async ({ page }) => {
  await page.locator('input[accept="application/pdf"]').setInputFiles([
    fixture('three-pages.pdf'),
    fixture('corrupt.pdf'),
    fixture('encrypted.pdf'),
  ])
  await expect(page.getByTestId('page-tile')).toHaveCount(3)
  await expect(page.getByRole('alert')).toContainText('corrupt.pdf')
  await expect(page.getByRole('alert')).toContainText('encrypted.pdf')
})

test('按知道了可以關掉錯誤列', async ({ page }) => {
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('corrupt.pdf')])
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: '知道了' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
