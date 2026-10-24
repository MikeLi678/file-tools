import { PDFDocument, degrees } from 'pdf-lib'
import type { LoadedPdf, Page } from '../types'

export type ExportInput = {
  pages: Page[]
  loadedFiles: Record<string, LoadedPdf>
}

export async function exportToPdf({ pages, loadedFiles }: ExportInput): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error('沒有可匯出的頁面')

  const out = await PDFDocument.create()
  // 同一份來源 PDF 只解析一次，避免 100 頁的文件被解析 100 遍
  const parsed = new Map<string, PDFDocument>()

  const getSource = async (fileId: string): Promise<PDFDocument> => {
    const cached = parsed.get(fileId)
    if (cached) return cached
    const file = loadedFiles[fileId]
    if (!file) throw new Error(`找不到來源檔案：${fileId}`)
    const doc = await PDFDocument.load(file.bytes)
    parsed.set(fileId, doc)
    return doc
  }

  for (const page of pages) {
    if (page.source.kind !== 'pdf') {
      throw new Error('此版本的 exporter 只支援 PDF 來源的頁面')
    }
    const source = await getSource(page.source.fileId)
    const [copied] = await out.copyPages(source, [page.source.pageIndex])
    // copyPages 保留來源頁面的 /Rotate，所以必須疊加而非覆寫
    const base = copied.getRotation().angle
    copied.setRotation(degrees(((base + page.rotation) % 360 + 360) % 360))
    out.addPage(copied)
  }

  return out.save()
}
