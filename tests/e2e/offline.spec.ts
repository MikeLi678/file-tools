import { test, expect } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// package.json 是 type: module，沒有 __dirname
const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => join(here, '../fixtures', name)

const baseURL = 'http://localhost:4173/'

test('整個合併流程不對外部主機發出任何請求', async ({ page }) => {
  const external: string[] = []
  page.on('request', request => {
    const url = request.url()
    // 只判定 http(s)；blob: 與 data: 的 hostname 是空字串，不是外部請求
    if (/^https?:/.test(url) && !url.startsWith(baseURL)) external.push(url)
  })

  await page.goto('./')
  await page.getByRole('button', { name: /合併 PDF/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await expect(page.getByTestId('page-tile')).toHaveCount(3)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 PDF' }).click()
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  await download

  expect(external).toEqual([])
})

test('預快取完成後離線仍能開啟並合併匯出', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await context.setOffline(true)

  await page.reload()
  await page.getByRole('button', { name: /合併 PDF/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await expect(page.getByTestId('page-tile')).toHaveCount(3)
  // 縮圖走 pdf.js 的 worker，匯出走 pdf-lib。只驗匯出的話，
  // worker 沒被預快取也看不出來——那正是離線最容易壞掉的地方。
  await expect(page.locator('.page-thumb img')).toHaveCount(3)
  await expect(page.locator('.thumb-placeholder')).toHaveCount(0)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 PDF' }).click()
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  await download
})

test('pdf.js 的 worker 有進預快取', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const names = await caches.keys()
          for (const name of names) {
            const keys = await (await caches.open(name)).keys()
            if (keys.some(request => request.url.includes('pdf.worker'))) return true
          }
          return false
        }),
      { timeout: 15_000 },
    )
    .toBe(true)
})

test('離線時也能把 PDF 轉成圖片', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const names = await caches.keys()
          for (const name of names) {
            const keys = await (await caches.open(name)).keys()
            if (keys.some(r => r.url.includes('pdf.worker'))) return true
          }
          return false
        }),
      { timeout: 15_000 },
    )
    .toBe(true)

  await context.setOffline(true)
  await page.reload({ waitUntil: 'load' })

  await page.getByRole('button', { name: /PDF 轉圖片/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await page.getByTestId('page-tile').nth(0).click()
  await page.getByRole('button', { name: /匯出勾選的 \d+ 頁為圖片/ }).click()

  // 轉圖片靠 pdf.js worker，worker 沒被預快取的話這裡會失敗
  await expect(page.getByRole('heading', { name: '匯出完成' })).toBeVisible({ timeout: 20_000 })
  await context.setOffline(false)
})
