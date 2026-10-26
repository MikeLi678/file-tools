import { PDFDocument, degrees } from 'pdf-lib'
import type { PDFImage, PDFPage } from 'pdf-lib'
import { appendImagePage } from './imageToPage'
import { normalizedToPdfRect, type PdfBox } from './signature/geometry'
import type { LoadedPdf, Page, SignatureOverlay } from '../types'

/** 匯出時要蓋上去的簽名圖。bytes 是 PNG */
export type SignatureAsset = {
  id: string
  bytes: Uint8Array
  width: number
  height: number
}

export type ExportInput = {
  pages: Page[]
  loadedFiles: Record<string, LoadedPdf>
  signatures: Record<string, SignatureAsset>
}

export async function exportToPdf({ pages, loadedFiles, signatures }: ExportInput): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error('沒有可匯出的頁面')

  const out = await PDFDocument.create()
  // 同一份來源 PDF 只解析一次，避免 100 頁的文件被解析 100 遍
  const parsed = new Map<string, PDFDocument>()
  // 同一個簽名只嵌入一次，否則蓋 20 頁就會有 20 份相同的影像
  const embedded = new Map<string, PDFImage>()

  const getSource = async (fileId: string): Promise<PDFDocument> => {
    const cached = parsed.get(fileId)
    if (cached) return cached
    const file = loadedFiles[fileId]
    if (!file) throw new Error(`找不到來源檔案：${fileId}`)
    const doc = await PDFDocument.load(file.bytes)
    parsed.set(fileId, doc)
    return doc
  }

  const getSignature = async (id: string): Promise<PDFImage | null> => {
    const cached = embedded.get(id)
    if (cached) return cached
    const asset = signatures[id]
    // 找不到就跳過這個覆蓋層，不讓整份匯出失敗
    if (!asset) return null
    const image = await out.embedPng(asset.bytes)
    embedded.set(id, image)
    return image
  }

  const drawOverlays = async (target: PDFPage, box: PdfBox, overlays: SignatureOverlay[]) => {
    for (const overlay of overlays) {
      const asset = signatures[overlay.signatureId]
      if (!asset) continue
      const image = await getSignature(overlay.signatureId)
      if (!image) continue
      // 覆蓋層存的是未旋轉座標，pdf-lib 的使用者空間也不受 /Rotate 影響，
      // 兩者是同一個空間，所以這裡不需要任何旋轉變換。
      const rect = normalizedToPdfRect(overlay, box, asset.height / asset.width)
      target.drawImage(image, rect)
    }
  }

  for (const page of pages) {
    if (page.source.kind === 'image') {
      const bytes = new Uint8Array(await page.source.blob.arrayBuffer())
      const placement = await appendImagePage(out, bytes, page.rotation)
      // 使用者看到的是影像本身，所以覆蓋層的盒子是影像區域而非整張 A4
      const target = out.getPage(out.getPageCount() - 1)
      await drawOverlays(target, placement, page.overlays)
      continue
    }
    const source = await getSource(page.source.fileId)
    const [copied] = await out.copyPages(source, [page.source.pageIndex])
    // copyPages 保留來源頁面的 /Rotate，所以必須疊加而非覆寫
    const base = copied.getRotation().angle
    copied.setRotation(degrees(((base + page.rotation) % 360 + 360) % 360))
    out.addPage(copied)
    // MediaBox 的原點不一定在 (0,0)，裁切過的 PDF 可能是 [20 20 615 862]
    const mediaBox = copied.getMediaBox()
    await drawOverlays(
      copied,
      { x: mediaBox.x, y: mediaBox.y, width: mediaBox.width, height: mediaBox.height },
      page.overlays,
    )
  }

  return out.save()
}
