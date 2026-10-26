import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument } from 'pdf-lib'
import { exportToPdf } from './exporter'
import { A4_LONG, A4_SHORT } from './imageToPage'
import type { LoadedPdf, Page, Rotation } from '../types'

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../../tests/fixtures', name)))

const loadedFrom = (fileId: string, name: string, pageCount: number): LoadedPdf => ({
  fileId,
  name,
  bytes: fixture(name),
  pageCount,
})

const pdfPage = (id: string, fileId: string, pageIndex: number, rotation: Rotation = 0): Page => ({
  id,
  source: { kind: 'pdf', fileId, pageIndex },
  rotation,
  selected: false,
  overlays: [],
})

describe('exportToPdf', () => {
  const three = loadedFrom('a', 'three-pages.pdf', 3)
  const rotated = loadedFrom('r', 'rotated-90.pdf', 1)

  it('依清單順序輸出頁面，不是依來源順序', async () => {
    const bytes = await exportToPdf({
      pages: [pdfPage('p3', 'a', 2), pdfPage('p1', 'a', 0), pdfPage('p2', 'a', 1)],
      loadedFiles: { a: three },
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(3)
    // three-pages.pdf 第 2 頁是橫向，重排後它應該落在第 3 頁
    const sizes = out.getPages().map(p => Math.round(p.getWidth()) > Math.round(p.getHeight()) ? 'landscape' : 'portrait')
    expect(sizes).toEqual(['portrait', 'portrait', 'landscape'])
  })

  it('合併兩份 PDF 的頁數是兩者相加', async () => {
    const bytes = await exportToPdf({
      pages: [pdfPage('p1', 'a', 0), pdfPage('p2', 'r', 0), pdfPage('p3', 'a', 1)],
      loadedFiles: { a: three, r: rotated },
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(3)
  })

  it('使用者的旋轉會寫進輸出', async () => {
    const bytes = await exportToPdf({
      pages: [pdfPage('p1', 'a', 0, 90)],
      loadedFiles: { a: three },
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getPage(0).getRotation().angle).toBe(90)
  })

  it('旋轉是疊加到來源頁面原有的 /Rotate 上，不是覆寫', async () => {
    // rotated-90.pdf 的唯一一頁本身就是 90 度
    const bytes = await exportToPdf({
      pages: [pdfPage('p1', 'r', 0, 90)],
      loadedFiles: { r: rotated },
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getPage(0).getRotation().angle).toBe(180)
  })

  it('疊加後超過 360 度會正規化', async () => {
    const bytes = await exportToPdf({
      pages: [pdfPage('p1', 'r', 0, 270)],
      loadedFiles: { r: rotated },
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getPage(0).getRotation().angle).toBe(0)
  })

  it('同一份 PDF 被多頁引用時只解析一次', async () => {
    const bytes = await exportToPdf({
      pages: [pdfPage('p1', 'a', 0), pdfPage('p2', 'a', 1), pdfPage('p3', 'a', 2)],
      loadedFiles: { a: three },
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(3)
  })

  it('頁面清單為空時丟出明確的錯誤', async () => {
    await expect(exportToPdf({ pages: [], loadedFiles: {} })).rejects.toThrow('沒有可匯出的頁面')
  })

  it('影像來源的頁面被排進混合清單的正確位置', async () => {
    const jpeg = new Blob([fixture('landscape.jpg')])
    const bytes = await exportToPdf({
      pages: [
        pdfPage('p1', 'a', 0),
        { id: 'img', source: { kind: 'image', blob: jpeg }, rotation: 0, selected: false, overlays: [] },
        pdfPage('p2', 'a', 1),
      ],
      loadedFiles: { a: three },
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(3)
    // 第 2 頁來自橫向 JPEG，所以是橫向 A4
    expect(out.getPage(1).getWidth()).toBeCloseTo(A4_LONG, 1)
    expect(out.getPage(1).getHeight()).toBeCloseTo(A4_SHORT, 1)
  })

  it('只有一張影像時也能匯出', async () => {
    const png = new Blob([fixture('portrait.png')])
    const bytes = await exportToPdf({
      pages: [{ id: 'img', source: { kind: 'image', blob: png }, rotation: 90, selected: false, overlays: [] }],
      loadedFiles: {},
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(1)
    expect(out.getPage(0).getRotation().angle).toBe(90)
  })

  it('引用了不存在的 fileId 時丟出明確的錯誤', async () => {
    await expect(
      exportToPdf({ pages: [pdfPage('p1', 'missing', 0)], loadedFiles: { a: three } }),
    ).rejects.toThrow('找不到來源檔案')
  })
})
