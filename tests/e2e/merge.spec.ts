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
  await expect(page.getByRole('button', { name: '匯出勾選的 2 頁', exact: true })).toBeEnabled()

  const first = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出勾選的 2 頁', exact: true }).click()
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  const firstDoc = await PDFDocument.load(new Uint8Array(readFileSync((await (await first).path())!)))
  expect(firstDoc.getPageCount()).toBe(2)

  await page.getByRole('button', { name: '返回編輯' }).click()
  await page.getByRole('button', { name: '反轉勾選' }).click()

  const second = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出勾選的 1 頁', exact: true }).click()
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

test('對原本就有旋轉的頁面再旋轉，角度是疊加不是覆寫', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /合併 PDF/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('rotated-90.pdf')])
  await expect(page.getByTestId('page-tile')).toHaveCount(1)

  // rotated-90.pdf 的唯一一頁原本就是 90 度，再轉 90 應該得到 180
  await page.getByTestId('page-tile').first().getByTestId('rotate').click()

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 PDF' }).click()
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()

  const doc = await PDFDocument.load(new Uint8Array(readFileSync((await (await download).path())!)))
  expect(doc.getPage(0).getRotation().angle).toBe(180)
})

test('拖曳重新排序後，匯出的頁序跟著改變', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /合併 PDF/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await expect(page.getByTestId('page-tile')).toHaveCount(3)
  await expect(page.locator('.page-thumb img')).toHaveCount(3)

  // three-pages.pdf 的第 2 頁是橫向，拖到最前面後匯出的第 1 頁就該是橫向
  const tiles = page.getByTestId('page-tile')
  const from = (await tiles.nth(1).boundingBox())!
  const to = (await tiles.nth(0).boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  // 先超過 MouseSensor 的 6px 門檻，再移到目標
  await page.mouse.move(from.x + from.width / 2 - 20, from.y + from.height / 2, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 })
  await page.mouse.up()
  await page.waitForTimeout(300)

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '匯出 PDF' }).click()
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()

  const doc = await PDFDocument.load(new Uint8Array(readFileSync((await (await download).path())!)))
  const isLandscape = (index: number) => doc.getPage(index).getWidth() > doc.getPage(index).getHeight()
  expect(isLandscape(0)).toBe(true)
  expect(isLandscape(1)).toBe(false)
  expect(isLandscape(2)).toBe(false)
})

test('來源頁本身有旋轉時，縮圖方向與匯出一致', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /合併 PDF/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('rotated-90.pdf')])
  await expect(page.locator('.page-thumb img')).toHaveCount(1)

  // rotated-90.pdf 的唯一一頁 /Rotate = 90，所以顯示上是橫向，縮圖也必須是橫向
  const landscape = await page.locator('.page-thumb img').first().evaluate(
    (img: HTMLImageElement) => img.naturalWidth > img.naturalHeight,
  )
  expect(landscape).toBe(true)
})

test('勾選後可以一次刪除多頁', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /合併 PDF/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await expect(page.getByTestId('page-tile')).toHaveCount(3)

  await page.getByRole('button', { name: '勾選抽頁' }).click()
  await page.getByTestId('page-tile').nth(0).click()
  await page.getByTestId('page-tile').nth(2).click()

  await page.getByRole('button', { name: '刪除勾選的 2 頁' }).click()
  await expect(page.getByTestId('page-tile')).toHaveCount(1)
  await expect(page.locator('.page-number')).toHaveText(['1'])
})

test('沒有勾選任何頁時不顯示刪除按鈕', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /合併 PDF/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await page.getByRole('button', { name: '勾選抽頁' }).click()
  await expect(page.getByRole('button', { name: /刪除勾選的/ })).toHaveCount(0)
})

test('可以自訂輸出檔名', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /合併 PDF/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await expect(page.getByTestId('page-tile')).toHaveCount(3)

  await page.getByRole('button', { name: '匯出 PDF' }).click()
  await page.getByLabel('輸出檔名').fill('我的報告')

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  expect((await download).suggestedFilename()).toBe('我的報告.pdf')
})

test('檔名留空時退回預設', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: /合併 PDF/ }).click()
  await page.locator('input[accept="application/pdf"]').setInputFiles([fixture('three-pages.pdf')])
  await page.getByRole('button', { name: '匯出 PDF' }).click()
  await page.getByLabel('輸出檔名').fill('')

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /儲存／分享|下載檔案/ }).click()
  expect((await download).suggestedFilename()).toMatch(/^file-tools-\d{8}-\d{4}\.pdf$/)
})
