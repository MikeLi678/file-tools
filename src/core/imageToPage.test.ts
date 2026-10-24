import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { A4_LONG, A4_SHORT, appendImagePage, detectImageType, fitOnA4 } from './imageToPage'

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../../tests/fixtures', name)))

describe('fitOnA4', () => {
  it('直向圖片放在直向 A4 上，高度貼滿', () => {
    const p = fitOnA4(100, 200)
    expect(p.pageWidth).toBeCloseTo(A4_SHORT, 2)
    expect(p.pageHeight).toBeCloseTo(A4_LONG, 2)
    expect(p.height).toBeCloseTo(A4_LONG, 2)
    expect(p.width).toBeCloseTo(A4_LONG / 2, 2)
    expect(p.y).toBeCloseTo(0, 2)
    expect(p.x).toBeCloseTo((A4_SHORT - A4_LONG / 2) / 2, 2)
  })

  it('橫向圖片放在橫向 A4 上，寬度貼滿', () => {
    const p = fitOnA4(200, 100)
    expect(p.pageWidth).toBeCloseTo(A4_LONG, 2)
    expect(p.pageHeight).toBeCloseTo(A4_SHORT, 2)
    expect(p.width).toBeCloseTo(A4_LONG, 2)
    expect(p.height).toBeCloseTo(A4_LONG / 2, 2)
    expect(p.x).toBeCloseTo(0, 2)
  })

  it('正方形圖片視為直向，寬度貼滿並垂直置中', () => {
    const p = fitOnA4(100, 100)
    expect(p.pageWidth).toBeCloseTo(A4_SHORT, 2)
    expect(p.width).toBeCloseTo(A4_SHORT, 2)
    expect(p.height).toBeCloseTo(A4_SHORT, 2)
    expect(p.x).toBeCloseTo(0, 2)
    expect(p.y).toBeCloseTo((A4_LONG - A4_SHORT) / 2, 2)
  })

  it('永遠等比，不拉伸', () => {
    const p = fitOnA4(300, 100)
    expect(p.width / p.height).toBeCloseTo(3, 5)
  })
})

describe('detectImageType', () => {
  it('認出 PNG', () => {
    expect(detectImageType(fixture('portrait.png'))).toBe('png')
  })
  it('認出 JPEG', () => {
    expect(detectImageType(fixture('landscape.jpg'))).toBe('jpeg')
  })
  it('認不出來的回 unknown', () => {
    expect(detectImageType(new Uint8Array([1, 2, 3, 4]))).toBe('unknown')
  })
})

describe('appendImagePage', () => {
  it('PNG 產生一頁直向 A4', async () => {
    const doc = await PDFDocument.create()
    await appendImagePage(doc, fixture('portrait.png'), 0)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getPage(0).getWidth()).toBeCloseTo(A4_SHORT, 1)
    expect(doc.getPage(0).getHeight()).toBeCloseTo(A4_LONG, 1)
  })

  it('JPEG 產生一頁橫向 A4', async () => {
    const doc = await PDFDocument.create()
    await appendImagePage(doc, fixture('landscape.jpg'), 0)
    expect(doc.getPage(0).getWidth()).toBeCloseTo(A4_LONG, 1)
    expect(doc.getPage(0).getHeight()).toBeCloseTo(A4_SHORT, 1)
  })

  it('旋轉寫進頁面', async () => {
    const doc = await PDFDocument.create()
    await appendImagePage(doc, fixture('portrait.png'), 270)
    expect(doc.getPage(0).getRotation().angle).toBe(270)
  })

  it('無法辨識的格式丟出明確錯誤', async () => {
    const doc = await PDFDocument.create()
    await expect(appendImagePage(doc, new Uint8Array([9, 9, 9]), 0)).rejects.toThrow('無法辨識的影像格式')
  })
})
