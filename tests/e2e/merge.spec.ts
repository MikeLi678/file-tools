import { test, expect } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'

// package.json 是 type: module，沒有 __dirname
const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => join(here, '../fixtures', name)

test('載入兩份 PDF 並合併匯出，頁數正確', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /合併 PDF/ }).click()

  await page.locator('input[accept="application/pdf"]').setInputFiles([
    fixture('three-pages.pdf'),
    fixture('rotated-90.pdf'),
  ])

  await expect(page.getByTestId('page-tile')).toHaveCount(4)
  await expect(page.locator('.editor-header .count')).toHaveText('4 頁')

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 PDF' }).click()
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()

  const file = await (await download).path()
  const doc = await PDFDocument.load(new Uint8Array(readFileSync(file!)))
  expect(doc.getPageCount()).toBe(4)
})

test('刪除一頁後匯出的頁數跟著減少', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /合併 PDF/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await expect(page.getByTestId('page-tile')).toHaveCount(3)

  await page.getByTestId('page-tile').nth(1).getByTestId('remove').click()
  await expect(page.getByTestId('page-tile')).toHaveCount(2)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 PDF' }).click()
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()

  const doc = await PDFDocument.load(new Uint8Array(readFileSync((await (await download).path())!)))
  expect(doc.getPageCount()).toBe(2)
})

test('旋轉後匯出的頁面帶著旋轉角度', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /合併 PDF/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])

  await page.getByTestId('page-tile').first().getByTestId('rotate').click()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 PDF' }).click()
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()

  const doc = await PDFDocument.load(new Uint8Array(readFileSync((await (await download).path())!)))
  expect(doc.getPage(0).getRotation().angle).toBe(90)
})

test('抽頁：勾選兩頁匯出只有兩頁，反轉後再匯出剩一頁', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /分割抽頁/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await expect(page.getByTestId('page-tile')).toHaveCount(3)

  await page.getByTestId('page-tile').nth(0).click()
  await page.getByTestId('page-tile').nth(2).click()
  await expect(page.getByRole('button', { name: '匯出勾選的 2 頁' })).toBeEnabled()

  const first = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出勾選的 2 頁' }).click()
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  const firstDoc = await PDFDocument.load(new Uint8Array(readFileSync((await (await first).path())!)))
  expect(firstDoc.getPageCount()).toBe(2)

  await page.getByRole('button', { name: '返回編輯' }).click()
  await page.getByRole('button', { name: '反轉勾選' }).click()

  const second = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出勾選的 1 頁' }).click()
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  const secondDoc = await PDFDocument.load(new Uint8Array(readFileSync((await (await second).path())!)))
  expect(secondDoc.getPageCount()).toBe(1)
})

test('單張照片可以選 JPEG，也仍然可以選 PDF', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /圖片轉 PDF/ }).click()
  await page.locator('input[accept="image/*"]').setInputFiles([fixture('portrait.png')])

  const asJpeg = page.waitForEvent('download')
  await page.getByRole('button', { name: '改成匯出 JPEG' }).click()
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  expect((await asJpeg).suggestedFilename()).toMatch(/\.jpg$/)

  await page.getByRole('button', { name: '返回編輯' }).click()
  const asPdf = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 PDF' }).click()
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  expect((await asPdf).suggestedFilename()).toMatch(/\.pdf$/)
})

test('兩張以上時沒有 JPEG 選項，匯出成 PDF', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /圖片轉 PDF/ }).click()
  await page.locator('input[accept="image/*"]').setInputFiles([fixture('portrait.png'), fixture('landscape.jpg')])
  await expect(page.getByTestId('page-tile')).toHaveCount(2)
  await expect(page.getByRole('button', { name: '改成匯出 JPEG' })).toHaveCount(0)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 PDF' }).click()
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/)
})
