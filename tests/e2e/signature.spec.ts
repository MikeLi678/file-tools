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
  // 覆蓋層在掛載就出現，但頁面圖是非同步的。拖曳要等頁面圖，
  // 否則 .placer-page 還是初始長寬比，座標換算會用錯的矩形。
  await page.locator('.placer-overlay.active').waitFor()
  await page.locator('.placer-image').waitFor()
}

/** 對第 index 頁蓋簽名庫裡的第一個簽名，停在定位畫面 */
async function signWithSaved(page: Page, index = 0) {
  await page.getByTestId('sign').nth(index).click()
  await page.locator('.signature-pick').first().click()
  // 覆蓋層在掛載就出現，但頁面圖是非同步的。拖曳要等頁面圖，
  // 否則 .placer-page 還是初始長寬比，座標換算會用錯的矩形。
  await page.locator('.placer-overlay.active').waitFor()
  await page.locator('.placer-image').waitFor()
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

/** 量深色像素的外接盒尺寸 */
async function inkBox(page: Page, bytes: Buffer) {
  return page.evaluate(async arr => {
    const blob = new Blob([new Uint8Array(arr)], { type: 'image/jpeg' })
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = bmp.width
    c.height = bmp.height
    const g = c.getContext('2d')!
    g.drawImage(bmp, 0, 0)
    bmp.close()
    const d = g.getImageData(0, 0, c.width, c.height).data
    let minX = c.width
    let maxX = -1
    let minY = c.height
    let maxY = -1
    for (let y = 0; y < c.height; y += 1) {
      for (let x = 0; x < c.width; x += 1) {
        const i = (y * c.width + x) * 4
        if (d[i] < 150 && d[i + 1] < 150 && d[i + 2] < 150) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    return { inkW: maxX - minX, inkH: maxY - minY }
  }, [...bytes])
}

test('旋轉 90 度後轉 JPEG，簽名本身跟著旋轉（變成細高）', async ({ page }) => {
  await openSign(page)
  await signNew(page)
  await done(page)
  await page.getByTestId('rotate').first().click()
  const ink = await inkBox(page, await exportFirstPageAsJpeg(page))
  // 簽名原本寬扁；只有簽名圖自己也轉了 90 度才會變成高大於寬。
  // 180 度那條測試只看帶狀分布，簽名自己上下顛倒時看不出來，這條補上。
  expect(ink.inkH).toBeGreaterThan(ink.inkW)
  console.log('旋轉90 外接盒', JSON.stringify(ink))
})

const topPercent = async (overlay: ReturnType<Page['getByTestId']>) =>
  parseFloat(await overlay.evaluate(el => (el as HTMLElement).style.top))
const widthPercent = async (overlay: ReturnType<Page['getByTestId']>) =>
  parseFloat(await overlay.evaluate(el => (el as HTMLElement).style.width))

test('旋轉 90 度的頁面上拖曳簽名，座標方向正確', async ({ page }) => {
  await openSign(page, 'rotated-90.pdf')
  await signNew(page)
  const overlay = page.getByTestId('placer-overlay').first()
  const before = await topPercent(overlay)
  const box = await overlay.boundingBox()
  if (!box) throw new Error('找不到覆蓋層')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  // 往顯示空間的左邊拖。頁面帶 /Rotate 90，顯示空間的「左」對應未旋轉空間的「下」，
  // 所以 top 的百分比應該增加。拿掉 toUnrotatedSpace 這條會變成減少或不變。
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx - 40, cy, { steps: 8 })
  await page.mouse.up()
  const after = await topPercent(overlay)
  console.log('拖曳前後 top', before, after)
  expect(after).toBeGreaterThan(before)
})

test('拖縮放圓點只改該覆蓋層的大小，另一個不變', async ({ page }) => {
  await openSign(page)
  await signNew(page)
  await done(page)
  await signWithSaved(page)
  await expect(page.getByTestId('placer-overlay')).toHaveCount(2)
  const first = page.getByTestId('placer-overlay').nth(0)
  const second = page.getByTestId('placer-overlay').nth(1)
  const firstBefore = await widthPercent(first)
  const secondBefore = await widthPercent(second)

  const handle = await page.getByTestId('placer-handle').boundingBox()
  if (!handle) throw new Error('找不到縮放圓點')
  const hx = handle.x + handle.width / 2
  const hy = handle.y + handle.height / 2
  await page.mouse.move(hx, hy)
  await page.mouse.down()
  await page.mouse.move(hx - 25, hy, { steps: 8 })
  await page.mouse.up()

  const firstAfter = await widthPercent(first)
  const secondAfter = await widthPercent(second)
  console.log('縮放前後 width', { firstBefore, firstAfter, secondBefore, secondAfter })
  // 縮放的是目前選取的（最後放的）那個，另一個的大小要原封不動
  expect(secondAfter).not.toBe(secondBefore)
  expect(firstAfter).toBe(firstBefore)
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
