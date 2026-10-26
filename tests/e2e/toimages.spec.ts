import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => join(here, '../fixtures', name)
const isJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff

test('PDF 轉圖片卡片進去就是勾選模式', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /PDF 轉圖片/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await expect(page.getByTestId('page-tile')).toHaveCount(3)
  await expect(page.getByRole('button', { name: '離開勾選' })).toBeVisible()
})

test('勾選兩頁轉圖片，得到兩個 JPEG', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /PDF 轉圖片/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await page.getByTestId('page-tile').nth(0).click()
  await page.getByTestId('page-tile').nth(2).click()

  await page.getByRole('button', { name: /匯出勾選的 \d+ 頁為圖片/ }).click()
  await expect(page.getByRole('heading', { name: '匯出完成' })).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.result-meta')).toContainText('2 個檔案')

  const downloads: string[] = []
  page.on('download', d => downloads.push(d.suggestedFilename()))
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  await expect.poll(() => downloads.length, { timeout: 15_000 }).toBe(2)
  expect(downloads[0]).toMatch(/-1\.jpg$/)
  expect(downloads[1]).toMatch(/-2\.jpg$/)
})

test('單頁轉圖片的檔名不帶序號，內容是真的 JPEG', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /PDF 轉圖片/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await page.getByTestId('page-tile').nth(0).click()
  await page.getByRole('button', { name: /匯出勾選的 \d+ 頁為圖片/ }).click()
  await expect(page.getByRole('heading', { name: '匯出完成' })).toBeVisible({ timeout: 20_000 })

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  const d = await download
  expect(d.suggestedFilename()).toMatch(/^file-tools-\d{8}-\d{4}\.jpg$/)
  expect(isJpeg(readFileSync((await d.path())!))).toBe(true)
})

test('來源頁本身有旋轉時，轉出的圖片是橫向', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /PDF 轉圖片/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('rotated-90.pdf')])
  await page.getByTestId('page-tile').nth(0).click()
  await page.getByRole('button', { name: /匯出勾選的 \d+ 頁為圖片/ }).click()
  await expect(page.getByRole('heading', { name: '匯出完成' })).toBeVisible({ timeout: 20_000 })

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  const bytes = readFileSync((await (await download).path())!)

  // rotated-90.pdf 的唯一一頁 /Rotate = 90，顯示上是橫向，轉出的圖片也必須是橫向。
  // 這條守的是「旋轉要疊加不是覆寫」——改成只傳 page.rotation 就會變直向。
  const size = jpegSize(bytes)
  expect(size.width).toBeGreaterThan(size.height)
})

/** 從 JPEG 的 SOF marker 讀出尺寸 */
function jpegSize(b: Buffer): { width: number; height: number } {
  let i = 2
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue }
    const marker = b[i + 1]
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8] }
    }
    i += 2 + ((b[i + 2] << 8) | b[i + 3])
  }
  throw new Error('讀不到 JPEG 尺寸')
}

test('超過 20 頁時擋下並說明原因', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /PDF 轉圖片/ }).click()
  // three-pages.pdf 選 7 次得到 21 頁
  await page
    .locator('input[accept="application/pdf"]')
    .setInputFiles(Array(7).fill(fixture('three-pages.pdf')))
  await expect(page.getByTestId('page-tile')).toHaveCount(21)

  await page.getByRole('button', { name: '反轉勾選' }).click()
  await page.getByRole('button', { name: /匯出勾選的 \d+ 頁為圖片/ }).click()

  await expect(page.getByRole('alert')).toContainText('一次最多只能轉 20 頁為圖片')
  await expect(page.getByRole('heading', { name: '匯出完成' })).toHaveCount(0)
})
