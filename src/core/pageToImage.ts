import { pdfjs } from './pdfjs'
import { LIMITS } from './limits'
import { renderImageToJpeg } from './output'
import type { LoadedPdf, Page } from '../types'

export type ImageExportProgress = { done: number; total: number }

export type PagesToJpegInput = {
  pages: Page[]
  loadedFiles: Record<string, LoadedPdf>
  onProgress?: (progress: ImageExportProgress) => void
}

/** 等比縮放到長邊等於 edge。純函式，方便測試。 */
export function fitToEdge(
  width: number,
  height: number,
  edge: number,
): { width: number; height: number } {
  const scale = edge / Math.max(width, height)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * 把頁面清單轉成 JPEG Blob 陣列。
 *
 * **必須序列處理。** 2000px 的 A4 canvas 約 11 MB，20 頁若同時存在就是 220 MB，
 * iOS Safari 會直接回收分頁。所以一次只渲染一頁，toBlob 之後立刻把 canvas
 * 的寬高設成 0 釋放，累積的只有 JPEG 本身（實測 20 頁約 16 MB（掃描件）到 47 MB（高解析照片））。
 *
 * 任一頁失敗就整批中止並往上拋。使用者預期拿到「這幾頁的圖片」，
 * 缺幾張比全部失敗更難發現。
 */
export async function pagesToJpegBlobs({
  pages,
  loadedFiles,
  onProgress,
}: PagesToJpegInput): Promise<Blob[]> {
  if (pages.length === 0) throw new Error('沒有可轉換的頁面')

  const blobs: Blob[] = []
  // 同一份來源 PDF 只解析一次
  const documents = new Map<string, pdfjs.PDFDocumentProxy>()

  try {
    for (const [index, page] of pages.entries()) {
      if (page.source.kind === 'image') {
        blobs.push(await renderImageToJpeg(page.source.blob, page.rotation, LIMITS.imageExportEdge))
      } else {
        const file = loadedFiles[page.source.fileId]
        if (!file) throw new Error(`找不到來源檔案：${page.source.fileId}`)

        let doc = documents.get(page.source.fileId)
        if (!doc) {
          // pdf.js 會把傳入的 buffer 轉移給 worker 並使其失效，所以必須給複本，
          // 否則 loadedFiles 裡的位元組會被掏空而無法再匯出 PDF
          doc = await pdfjs.getDocument({ data: file.bytes.slice() }).promise
          documents.set(page.source.fileId, doc)
        }
        blobs.push(await renderPdfPage(doc, page.source.pageIndex, page.rotation))
      }
      onProgress?.({ done: index + 1, total: pages.length })
    }
  } finally {
    for (const doc of documents.values()) {
      doc.destroy().catch(() => {})
    }
  }

  return blobs
}

async function renderPdfPage(
  doc: pdfjs.PDFDocumentProxy,
  pageIndex: number,
  rotation: number,
): Promise<Blob> {
  const pdfPage = await doc.getPage(pageIndex + 1)

  // pdf.js 的 getViewport({ rotation }) 是「取代」頁面自身的 /Rotate，不是疊加。
  // Page.rotation 是使用者施加的相對旋轉，所以要自己先加起來，否則來源頁有
  // /Rotate 時，轉出的圖片方向會與編輯器所見差 90 度的倍數。
  // v1 的最終 review 就是在 thumbnailer 抓到這個 Critical，同一個坑不能再踩。
  const effective = (((pdfPage.rotate + rotation) % 360) + 360) % 360
  const base = pdfPage.getViewport({ scale: 1, rotation: effective })
  const target = fitToEdge(base.width, base.height, LIMITS.imageExportEdge)
  // scale 要用套過 effective 的 viewport 尺寸算，否則旋轉時輸出尺寸會不穩定
  const viewport = pdfPage.getViewport({
    scale: target.width / base.width,
    rotation: effective,
  })

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)

  try {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('無法取得 canvas context')

    // PDF 頁面是透明的，不填白底的話 JPEG 會變成黑色
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)

    await pdfPage.render({ canvasContext: context, viewport }).promise
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', LIMITS.jpegQuality),
    )
    if (!blob) throw new Error('影像輸出失敗')
    return blob
  } finally {
    // 立刻釋放，否則 20 頁的 canvas 會同時佔住記憶體
    canvas.width = 0
    canvas.height = 0
    // worker 裡該頁的解碼影像也要放掉，否則 20 頁會一路累積到整批結束
    pdfPage.cleanup()
  }
}
