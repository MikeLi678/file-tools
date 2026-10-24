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
  // 等預快取（含 pdf.js worker）寫完
  await page.waitForTimeout(3000)
  await context.setOffline(true)

  await page.reload()
  await page.getByRole('button', { name: /合併 PDF/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await expect(page.getByTestId('page-tile')).toHaveCount(3)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 PDF' }).click()
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  await download
})
