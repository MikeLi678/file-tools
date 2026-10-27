import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync } from 'node:fs'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => join(here, '../fixtures', name)

async function drawSignature(page: Page) {
  const pad = page.getByTestId('signature-pad')
  const box = await pad.boundingBox()
  if (!box) throw new Error('找不到簽名畫布')
  await page.mouse.move(box.x + 30, box.y + box.height * 0.7)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.25, { steps: 12 })
  await page.mouse.move(box.x + box.width * 0.85, box.y + box.height * 0.6, { steps: 12 })
  await page.mouse.up()
}

async function openSign(page: Page, file = 'three-pages.pdf') {
  await page.goto('./')
  await page.getByRole('button', { name: /簽署文件/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture(file)])
  await expect(page.getByTestId('page-tile').first()).toBeVisible()
}

/** 對第 index 頁簽一個全新的簽名，停在定位畫面 */
async function signNew(page: Page, index = 0) {
  await page.getByTestId('sign').nth(index).click()
  await page.getByRole('button', { name: '簽一個新的' }).click()
  await drawSignature(page)
  await page.getByRole('button', { name: '儲存簽名' }).click()
  await page.getByTestId('placer-overlay').first().waitFor()
}

/** 對第 index 頁蓋簽名庫裡的第一個簽名，停在定位畫面 */
async function signWithSaved(page: Page, index = 0) {
  await page.getByTestId('sign').nth(index).click()
  await page.locator('.signature-pick').first().click()
  await page.getByTestId('placer-overlay').first().waitFor()
}

const done = (page: Page) => page.getByRole('button', { name: '完成' }).last().click()

async function darkBands(page: Page, bytes: Buffer) {
  return page.evaluate(async arr => {
    const blob = new Blob([new Uint8Array(arr)], { type: 'image/jpeg' })
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    const g = c.getContext('2d')!
    g.drawImage(bmp, 0, 0)
    const band = (y0: number, y1: number) => {
      const y = Math.round(y0 * c.height)
      const h = Math.max(1, Math.round((y1 - y0) * c.height))
      const d = g.getImageData(0, y, c.width, h).data
      let dark = 0
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < 150 && d[i + 1] < 150 && d[i + 2] < 150) dark += 1
      }
      return dark / (d.length / 4)
    }
    bmp.close()
    return { upper: band(0.05, 0.35), middle: band(0.35, 0.65), lower: band(0.65, 0.95) }
  }, [...bytes])
}

/** 第 1 頁（已簽名）走勾選轉 JPEG，回傳下載的位元組 */
async function exportFirstPageAsJpeg(page: Page) {
  await page.getByRole('button', { name: '勾選抽頁' }).click()
  await page.getByTestId('page-tile').nth(0).click()
  await page.getByRole('button', { name: /改成匯出勾選的 \d+ 頁為圖片/ }).click()
  await expect(page.getByRole('heading', { name: '匯出完成' })).toBeVisible({ timeout: 20_000 })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  return readFileSync((await (await download).path())!)
}

test('簽名存得起來，重新載入後還在', async ({ page }) => {
  await openSign(page)
  await signNew(page)
  await done(page)
  await expect(page.locator('.thumb-signed')).toHaveCount(1)

  await page.reload()
  await page.getByRole('button', { name: /簽署文件/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await expect(page.getByTestId('page-tile')).toHaveCount(3)
  await page.getByTestId('sign').first().click()
  await expect(page.locator('.signature-item')).toHaveCount(1)
})

test('簽名後轉 JPEG，深色像素在下半', async ({ page }) => {
  await openSign(page)
  await signNew(page)
  await done(page)
  const bands = await darkBands(page, await exportFirstPageAsJpeg(page))
  expect(bands.lower).toBeGreaterThan(0.001)
  expect(bands.upper).toBeLessThan(0.0005)
  console.log('未旋轉', JSON.stringify(bands))
})

test('旋轉 180 度後轉 JPEG，深色像素改到上半', async ({ page }) => {
  await openSign(page)
  await signNew(page)
  await done(page)
  await page.getByTestId('rotate').first().click()
  await page.getByTestId('rotate').first().click()
  const bands = await darkBands(page, await exportFirstPageAsJpeg(page))
  // 簽名跟著內容旋轉：這條守的是整個座標系統的設計決定
  expect(bands.upper).toBeGreaterThan(0.001)
  expect(bands.lower).toBeLessThan(0.0005)
  console.log('旋轉180', JSON.stringify(bands))
})

test('同一頁蓋兩個簽名', async ({ page }) => {
  await openSign(page)
  await signNew(page)
  await done(page)
  await signWithSaved(page)
  await expect(page.getByTestId('placer-overlay')).toHaveCount(2)
  await done(page)
  await expect(page.locator('.thumb-signed')).toHaveCount(1)
})

test('影像頁也能蓋簽名並匯出', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /圖片轉 PDF/ }).click()
  await page.locator('input[accept="image/*"]').setInputFiles([fixture('portrait.png')])
  await expect(page.getByTestId('page-tile')).toHaveCount(1)
  await signNew(page)
  await done(page)
  await expect(page.locator('.thumb-signed')).toHaveCount(1)

  await page.getByRole('button', { name: '匯出 PDF' }).click()
  await expect(page.getByRole('heading', { name: '匯出完成' })).toBeVisible({ timeout: 20_000 })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  const d = await download
  expect(d.suggestedFilename()).toMatch(/\.pdf$/)
  expect(readFileSync((await d.path())!).subarray(0, 5).toString()).toBe('%PDF-')
})

test('刪除簽名庫裡的簽名，已蓋上的覆蓋層也消失', async ({ page }) => {
  await openSign(page)
  await signNew(page)
  await done(page)
  await expect(page.locator('.thumb-signed')).toHaveCount(1)

  await page.getByTestId('sign').first().click()
  await page.locator('.signature-item').getByRole('button', { name: '刪除' }).click()
  await expect(page.locator('.signature-item')).toHaveCount(0)
  await page.getByRole('button', { name: '返回' }).click()
  await expect(page.locator('.thumb-signed')).toHaveCount(0)
})

test('每頁覆蓋層達上限後「簽名」按鈕 disabled', async ({ page }) => {
  await openSign(page)
  await signNew(page)
  await done(page)
  for (let i = 1; i < 5; i += 1) {
    await signWithSaved(page)
    await done(page)
  }
  await expect(page.getByTestId('sign').first()).toBeDisabled()
  await expect(page.getByTestId('sign').nth(1)).toBeEnabled()
})

test('離線狀態下完成簽名與匯出', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          for (const name of await caches.keys()) {
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
  await page.getByRole('button', { name: /簽署文件/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await expect(page.locator('.page-thumb img')).toHaveCount(3)
  await signNew(page)
  await done(page)

  await page.getByRole('button', { name: '匯出 PDF' }).click()
  await expect(page.getByRole('heading', { name: '匯出完成' })).toBeVisible({ timeout: 20_000 })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  await download
  await context.setOffline(false)
})
