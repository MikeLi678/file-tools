import { test, expect } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'

// package.json 是 type: module，沒有 __dirname
const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => join(here, '../fixtures', name)

test('掃描一頁後加入編輯器，並能與 PDF 一起匯出', async ({ page, context }) => {
  await context.grantPermissions(['camera'])
  await page.goto('./')
  await page.getByRole('button', { name: /掃描文件/ }).click()

  await expect(page.getByRole('button', { name: '拍攝' })).toBeEnabled({ timeout: 20_000 })
  // 按鈕啟用不代表第一格畫面已到，等 videoWidth 大於 0 再拍
  await expect.poll(() => page.getByTestId('camera-preview').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0)
  await page.getByRole('button', { name: '拍攝' }).click()

  await expect(page.getByRole('heading', { name: '調整範圍' })).toBeVisible()
  await expect(page.getByTestId('crop-handle-0')).toBeVisible()

  await page.getByRole('button', { name: '黑白' }).click()
  await page.getByRole('button', { name: '加入這一頁' }).click()

  await expect(page.getByTestId('page-tile')).toHaveCount(1)

  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await expect(page.getByTestId('page-tile')).toHaveCount(4)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 PDF' }).click()
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()

  const doc = await PDFDocument.load(new Uint8Array(readFileSync((await (await download).path())!)))
  expect(doc.getPageCount()).toBe(4)
})

test('拖動裁切點會改變四邊形', async ({ page, context }) => {
  await context.grantPermissions(['camera'])
  await page.goto('./')
  await page.getByRole('button', { name: /掃描文件/ }).click()
  await expect(page.getByRole('button', { name: '拍攝' })).toBeEnabled({ timeout: 20_000 })
  // 按鈕啟用不代表第一格畫面已到，等 videoWidth 大於 0 再拍
  await expect.poll(() => page.getByTestId('camera-preview').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0)
  await page.getByRole('button', { name: '拍攝' }).click()

  const before = await page.locator('.crop-polygon').getAttribute('points')
  const handle = page.getByTestId('crop-handle-0')
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 60, box.y + 60, { steps: 10 })
  await page.mouse.up()

  const after = await page.locator('.crop-polygon').getAttribute('points')
  expect(after).not.toBe(before)
})

test('重拍會回到取景畫面', async ({ page, context }) => {
  await context.grantPermissions(['camera'])
  await page.goto('./')
  await page.getByRole('button', { name: /掃描文件/ }).click()
  await expect(page.getByRole('button', { name: '拍攝' })).toBeEnabled({ timeout: 20_000 })
  // 按鈕啟用不代表第一格畫面已到，等 videoWidth 大於 0 再拍
  await expect.poll(() => page.getByTestId('camera-preview').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0)
  await page.getByRole('button', { name: '拍攝' }).click()
  await page.getByRole('button', { name: '重拍' }).click()
  await expect(page.getByRole('button', { name: '拍攝' })).toBeVisible()
})
