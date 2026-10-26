import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PDFDocument, PDFDict, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import type { PDFPage } from 'pdf-lib'
import { exportToPdf, type SignatureAsset } from './exporter'
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

type DrawnImage = { name: string; x: number; y: number; width: number; height: number }

/**
 * 讀出頁面內容串流裡所有「畫影像」的運算，回傳影像名稱、左下角與寬高。
 * exportToPdf 回傳的是已存檔的位元組，PDFDocument.load 後內容串流是壓縮的 PDFRawStream，
 * 所以要用 decodePDFRawStream 解開再解析文字運算子。
 */
function drawnImages(doc: PDFDocument, page: PDFPage): DrawnImage[] {
  const contents = page.node.Contents() as any
  const refs = typeof contents?.asArray === 'function' ? contents.asArray() : contents ? [contents] : []
  const result: DrawnImage[] = []
  for (const ref of refs) {
    const stream = doc.context.lookup(ref)
    if (!(stream instanceof PDFRawStream)) continue
    const text = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')
    let translate: { x: number; y: number } | null = null
    let scale: { width: number; height: number } | null = null
    for (const op of text.split('\n').map(l => l.trim())) {
      // 平移矩陣：1 0 0 1 <x> <y> cm，單位矩陣（0 0）不算
      const t = op.match(/^1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm$/)
      if (t && (Number(t[1]) !== 0 || Number(t[2]) !== 0)) {
        translate = { x: Number(t[1]), y: Number(t[2]) }
        continue
      }
      // 縮放矩陣：<w> 0 0 <h> 0 0 cm，寬為 1 的視為單位矩陣
      const s = op.match(/^(-?[\d.]+) 0 0 (-?[\d.]+) 0 0 cm$/)
      if (s && Number(s[1]) !== 1) {
        scale = { width: Number(s[1]), height: Number(s[2]) }
        continue
      }
      const d = op.match(/^\/(\S+) Do$/)
      if (d && translate && scale) {
        result.push({ name: d[1], ...translate, ...scale })
        translate = null
        scale = null
      }
    }
  }
  return result
}

describe('exportToPdf', () => {
  const three = loadedFrom('a', 'three-pages.pdf', 3)
  const rotated = loadedFrom('r', 'rotated-90.pdf', 1)

  it('依清單順序輸出頁面，不是依來源順序', async () => {
    const bytes = await exportToPdf({
      pages: [pdfPage('p3', 'a', 2), pdfPage('p1', 'a', 0), pdfPage('p2', 'a', 1)],
      loadedFiles: { a: three }, signatures: {},
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
      loadedFiles: { a: three, r: rotated }, signatures: {},
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(3)
  })

  it('使用者的旋轉會寫進輸出', async () => {
    const bytes = await exportToPdf({
      pages: [pdfPage('p1', 'a', 0, 90)],
      loadedFiles: { a: three }, signatures: {},
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getPage(0).getRotation().angle).toBe(90)
  })

  it('旋轉是疊加到來源頁面原有的 /Rotate 上，不是覆寫', async () => {
    // rotated-90.pdf 的唯一一頁本身就是 90 度
    const bytes = await exportToPdf({
      pages: [pdfPage('p1', 'r', 0, 90)],
      loadedFiles: { r: rotated }, signatures: {},
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getPage(0).getRotation().angle).toBe(180)
  })

  it('疊加後超過 360 度會正規化', async () => {
    const bytes = await exportToPdf({
      pages: [pdfPage('p1', 'r', 0, 270)],
      loadedFiles: { r: rotated }, signatures: {},
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getPage(0).getRotation().angle).toBe(0)
  })

  it('同一份 PDF 被多頁引用時只解析一次', async () => {
    const bytes = await exportToPdf({
      pages: [pdfPage('p1', 'a', 0), pdfPage('p2', 'a', 1), pdfPage('p3', 'a', 2)],
      loadedFiles: { a: three }, signatures: {},
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(3)
  })

  it('頁面清單為空時丟出明確的錯誤', async () => {
    await expect(exportToPdf({ pages: [], loadedFiles: {}, signatures: {} })).rejects.toThrow('沒有可匯出的頁面')
  })

  it('影像來源的頁面被排進混合清單的正確位置', async () => {
    const jpeg = new Blob([fixture('landscape.jpg')])
    const bytes = await exportToPdf({
      pages: [
        pdfPage('p1', 'a', 0),
        { id: 'img', source: { kind: 'image', blob: jpeg }, rotation: 0, selected: false, overlays: [] },
        pdfPage('p2', 'a', 1),
      ],
      loadedFiles: { a: three }, signatures: {},
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
      loadedFiles: {}, signatures: {},
    })
    const out = await PDFDocument.load(bytes)
    expect(out.getPageCount()).toBe(1)
    expect(out.getPage(0).getRotation().angle).toBe(90)
  })

  it('引用了不存在的 fileId 時丟出明確的錯誤', async () => {
    await expect(
      exportToPdf({ pages: [pdfPage('p1', 'missing', 0)], loadedFiles: { a: three }, signatures: {} }),
    ).rejects.toThrow('找不到來源檔案')
  })

  describe('覆蓋層', () => {
    // signature.png 是 600x200，長寬比 1/3
    const signatureAsset = (): SignatureAsset => ({
      id: 's1',
      bytes: fixture('signature.png'),
      width: 600,
      height: 200,
    })

    const imagePageWith = (id: string, overlays: Page['overlays']): Page => ({
      id,
      source: { kind: 'image', blob: new Blob([fixture('portrait.png')], { type: 'image/png' }) },
      rotation: 0,
      selected: false,
      overlays,
    })

    const overlay = [{ id: 'o1', signatureId: 's1', x: 0.1, y: 0.8, width: 0.3 }]

    const expectRect = (actual: DrawnImage, x: number, y: number, width: number, height: number) => {
      expect(actual.x).toBeCloseTo(x, 3)
      expect(actual.y).toBeCloseTo(y, 3)
      expect(actual.width).toBeCloseTo(width, 3)
      expect(actual.height).toBeCloseTo(height, 3)
    }

    const exportPdfPage = async (fileId: string, loaded: LoadedPdf, overlays: Page['overlays']) => {
      const bytes = await exportToPdf({
        pages: [{ ...pdfPage('p1', fileId, 0), overlays }],
        loadedFiles: { [fileId]: loaded },
        signatures: { s1: signatureAsset() },
      })
      return PDFDocument.load(bytes)
    }

    it('PDF 頁沒有覆蓋層時，頁面沒有畫任何影像', async () => {
      const out = await exportPdfPage('a', three, [])
      expect(drawnImages(out, out.getPage(0))).toEqual([])
    })

    it('PDF 頁的覆蓋層畫在正確位置', async () => {
      const out = await exportPdfPage('a', three, overlay)
      const drawn = drawnImages(out, out.getPage(0))
      expect(drawn).toHaveLength(1)
      expectRect(drawn[0], 59.528, 108.85, 178.584, 59.528)
    })

    it('MediaBox 原點不在 (0,0) 時座標要加上偏移', async () => {
      const offset = loadedFrom('o', 'offset-mediabox.pdf', 1)
      const out = await exportPdfPage('o', offset, overlay)
      const drawn = drawnImages(out, out.getPage(0))
      expect(drawn).toHaveLength(1)
      expectRect(drawn[0], 79.5, 138.9, 178.5, 59.5)
    })

    it('影像頁的覆蓋層用 fitOnA4 的 placement 當盒子，不是整張 A4', async () => {
      const bytes = await exportToPdf({
        pages: [imagePageWith('p1', overlay)],
        loadedFiles: {},
        signatures: { s1: signatureAsset() },
      })
      const out = await PDFDocument.load(bytes)
      const drawn = drawnImages(out, out.getPage(0))
      // 第一個是影像頁本身的底圖，最後一個才是簽名
      expect(drawn).toHaveLength(2)
      expectRect(drawn[1], 129.262, 126.2835, 126.2835, 42.0945)
    })

    it('同一個簽名蓋在三頁時，三頁引用的是同一個影像物件', async () => {
      const bytes = await exportToPdf({
        pages: [pdfPage('p1', 'a', 0), pdfPage('p2', 'a', 1), pdfPage('p3', 'a', 2)].map(p => ({ ...p, overlays: overlay })),
        loadedFiles: { a: three },
        signatures: { s1: signatureAsset() },
      })
      const out = await PDFDocument.load(bytes)
      // 影像名稱是每頁 Resources 內的別名，要解析到 XObject 的間接參照才能比較是不是同一個物件
      const refs = out.getPages().flatMap(p => {
        const xobjects = p.node.Resources()!.lookup(PDFName.of('XObject'), PDFDict)
        return drawnImages(out, p).map(d => String(xobjects.get(PDFName.of(d.name))))
      })
      expect(refs).toHaveLength(3)
      expect(new Set(refs).size).toBe(1)
    })

    it('沒有覆蓋層時仍然正常輸出', async () => {
      const bytes = await exportToPdf({
        pages: [imagePageWith('p1', [])],
        loadedFiles: {},
        signatures: {},
      })
      const out = await PDFDocument.load(bytes)
      expect(out.getPageCount()).toBe(1)
    })

    it('影像頁蓋上覆蓋層後仍然只有一頁', async () => {
      const bytes = await exportToPdf({
        pages: [imagePageWith('p1', [{ id: 'o1', signatureId: 's1', x: 0.1, y: 0.8, width: 0.3 }])],
        loadedFiles: {},
        signatures: { s1: signatureAsset() },
      })
      const out = await PDFDocument.load(bytes)
      expect(out.getPageCount()).toBe(1)
    })

    it('PDF 頁蓋上覆蓋層後頁數與旋轉都不變', async () => {
      const bytes = await exportToPdf({
        pages: [
          {
            ...pdfPage('p1', 'r', 0, 90),
            overlays: [{ id: 'o1', signatureId: 's1', x: 0.1, y: 0.8, width: 0.3 }],
          },
        ],
        loadedFiles: { r: rotated },
        signatures: { s1: signatureAsset() },
      })
      const out = await PDFDocument.load(bytes)
      expect(out.getPageCount()).toBe(1)
      // rotated-90.pdf 自身是 /Rotate 90，再加使用者的 90 應該疊加成 180
      expect(out.getPage(0).getRotation().angle).toBe(180)
    })

    it('找不到 signatureId 時跳過該覆蓋層而不是整份失敗', async () => {
      const bytes = await exportToPdf({
        pages: [imagePageWith('p1', [{ id: 'o1', signatureId: '不存在', x: 0.1, y: 0.8, width: 0.3 }])],
        loadedFiles: {},
        signatures: {},
      })
      const out = await PDFDocument.load(bytes)
      expect(out.getPageCount()).toBe(1)
    })

    it('同一個簽名用在三頁只嵌入一次', async () => {
      const overlays = [{ id: 'o1', signatureId: 's1', x: 0.1, y: 0.8, width: 0.3 }]
      const withSig = await exportToPdf({
        pages: [imagePageWith('p1', overlays), imagePageWith('p2', overlays), imagePageWith('p3', overlays)],
        loadedFiles: {},
        signatures: { s1: signatureAsset() },
      })
      const withoutSig = await exportToPdf({
        pages: [imagePageWith('p1', []), imagePageWith('p2', []), imagePageWith('p3', [])],
        loadedFiles: {},
        signatures: {},
      })
      const signatureBytes = fixture('signature.png').byteLength
      // 嵌入一次的話，三頁版本只比沒有簽名的版本多出大約一份簽名的量；
      // 嵌入三次就會多出三份。用 2 倍當界線，對嵌入次數的錯誤很敏感。
      expect(withSig.byteLength - withoutSig.byteLength).toBeLessThan(signatureBytes * 2)
    })
  })
})
