import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'

// package.json 是 type: module，沒有 __dirname
const here = dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => join(here, '../fixtures', name)

/** 走到裁切階段：開相機、等第一格畫面、拍攝 */
async function goToCrop(page: Page, context: BrowserContext) {
  await context.grantPermissions(['camera'])
  await page.goto('./')
  await page.getByRole('button', { name: /掃描文件/ }).click()
  await expect(page.getByRole('button', { name: '拍攝' })).toBeEnabled({ timeout: 20_000 })
  // 按鈕啟用不代表第一格畫面已到，等 videoWidth 大於 0 再拍
  await expect.poll(() => page.getByTestId('camera-preview').evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0)
  await page.getByRole('button', { name: '拍攝' }).click()
  await expect(page.getByRole('heading', { name: '調整範圍' })).toBeVisible()
  await expect(page.getByTestId('crop-handle-0')).toBeVisible()
}

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

test('拖四角時出現放大鏡，鬆手後消失', async ({ page, context }) => {
  await goToCrop(page, context)
  await expect(page.getByTestId('crop-magnifier')).toHaveCount(0)
  const box = (await page.getByTestId('crop-handle-0').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20, { steps: 5 })
  await expect(page.getByTestId('crop-magnifier')).toHaveCount(1)
  // 放大鏡不能吃事件。拖曳中有 pointer capture，事件仍會送到角點，
  // 所以行為測不出差別，直接斷言它不接收指標事件
  await expect(page.getByTestId('crop-magnifier')).toHaveCSS('pointer-events', 'none')
  await page.mouse.up()
  await expect(page.getByTestId('crop-magnifier')).toHaveCount(0)
})

test('放大鏡在與被拖曳角點相反的垂直半邊', async ({ page, context }) => {
  await goToCrop(page, context)
  const oBox = (await page.locator('.crop-overlay').boundingBox())!

  // 左上角（上半）→ 放大鏡應在下半
  const tlBox = (await page.getByTestId('crop-handle-0').boundingBox())!
  await page.mouse.move(tlBox.x + tlBox.width / 2, tlBox.y + tlBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(tlBox.x + tlBox.width / 2 + 10, tlBox.y + tlBox.height / 2 + 10, { steps: 3 })
  const magBox = (await page.getByTestId('crop-magnifier').boundingBox())!
  expect(magBox.y + magBox.height / 2).toBeGreaterThan(oBox.y + oBox.height / 2)
  await page.mouse.up()
})

test('偵測有接上：用真實文件影像拍攝，裁切框貼合文件而非預設框', async ({ page, context }) => {
  // 真值從 scan-cases.json 讀，不在測試裡再寫一份
  const cases = JSON.parse(readFileSync(fixture('scan-cases.json'), 'utf8')) as {
    name: string
    quad: [number, number][]
    width: number
    height: number
  }[]
  const plain = cases.find(c => c.name === 'plain')!
  const dataUrl = 'data:image/png;base64,' + readFileSync(fixture('scan-plain.png')).toString('base64')

  // 把文件影像畫進 canvas，用 captureStream 當假相機
  await page.addInitScript(
    ({ dataUrl, width, height }) => {
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')!
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('假影像載入失敗'))
          img.src = dataUrl
        })
        // captureStream 只在畫面有變化時送格，持續重畫確保有影格
        const draw = () => ctx.drawImage(img, 0, 0)
        draw()
        setInterval(draw, 50)
        return canvas.captureStream(15)
      }
    },
    { dataUrl, width: plain.width, height: plain.height },
  )

  await goToCrop(page, context)

  const corners: { x: number; y: number }[] = []
  for (let i = 0; i < 4; i++) {
    const h = page.getByTestId(`crop-handle-${i}`)
    corners.push({ x: Number(await h.getAttribute('cx')), y: Number(await h.getAttribute('cy')) })
  }
  console.log('量到的四角：', JSON.stringify(corners))

  const tolerance = Math.max(plain.width, plain.height) * 0.02
  plain.quad.forEach(([tx, ty], i) => {
    expect(Math.abs(corners[i].x - tx), `角 ${i} x`).toBeLessThan(tolerance)
    expect(Math.abs(corners[i].y - ty), `角 ${i} y`).toBeLessThan(tolerance)
  })
  await expect(page.getByTestId('detect-fallback')).toHaveCount(0)
})
