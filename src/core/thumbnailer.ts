import { pdfjs } from './pdfjs'
import { LIMITS } from './limits'
import type { LoadedPdf, Page, Rotation } from '../types'

export type Thumbnailer = {
  get(page: Page, loadedFiles: Record<string, LoadedPdf>): Promise<string>
  clear(): void
}

const cacheKey = (page: Page) => `${page.id}:${page.rotation}`

function targetWidth(): number {
  const ratio = Math.min(LIMITS.thumbnailMaxScale, globalThis.devicePixelRatio || 1)
  return LIMITS.thumbnailWidth * ratio
}

export function createThumbnailer(): Thumbnailer {
  const cache = new Map<string, string>()
  const inFlight = new Map<string, Promise<string>>()
  const documents = new Map<string, Promise<pdfjs.PDFDocumentProxy>>()
  const queue: (() => void)[] = []
  let active = 0
  // 每次 clear 加一。clear 之前發出的工作完成時，若世代已變，
  // 產出的 blob URL 要立刻撤銷，不能寫進快取或回傳給呼叫端。
  let generation = 0

  function pump() {
    while (active < LIMITS.thumbnailConcurrency && queue.length > 0) {
      active++
      queue.shift()!()
    }
  }

  function schedule<T>(job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        job()
          .then(resolve, reject)
          .finally(() => {
            active--
            pump()
          })
      })
      pump()
    })
  }

  function getDocument(file: LoadedPdf): Promise<pdfjs.PDFDocumentProxy> {
    const existing = documents.get(file.fileId)
    if (existing) return existing
    // pdf.js 會把傳入的 buffer 轉移給 worker 並使其失效，
    // 所以必須給複本，否則 loadedFiles 裡的位元組會被掏空而無法匯出。
    const promise = pdfjs.getDocument({ data: file.bytes.slice() }).promise
    documents.set(file.fileId, promise)
    return promise
  }

  async function renderPdfPage(page: Page & { source: { kind: 'pdf' } }, file: LoadedPdf): Promise<string> {
    const doc = await getDocument(file)
    const pdfPage = await doc.getPage(page.source.pageIndex + 1)
    // pdf.js 的 getViewport({ rotation }) 是「取代」頁面自身的 /Rotate，不是疊加。
    // Page.rotation 是使用者施加的相對旋轉，所以要自己先加起來，
    // 否則來源頁有 /Rotate 時，縮圖方向會與匯出結果永遠差 90 度的倍數。
    const effective = (((pdfPage.rotate + page.rotation) % 360) + 360) % 360
    const base = pdfPage.getViewport({ scale: 1, rotation: effective })
    const scale = targetWidth() / base.width
    const viewport = pdfPage.getViewport({ scale, rotation: effective })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('無法取得 canvas context')
    await pdfPage.render({ canvasContext: context, viewport }).promise
    return canvasToUrl(canvas)
  }

  async function renderImage(blob: Blob, rotation: Rotation): Promise<string> {
    const bitmap = await createImageBitmap(blob)
    const swap = rotation === 90 || rotation === 270
    const scale = targetWidth() / (swap ? bitmap.height : bitmap.width)
    const width = bitmap.width * scale
    const height = bitmap.height * scale
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(swap ? height : width)
    canvas.height = Math.ceil(swap ? width : height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('無法取得 canvas context')
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate((rotation * Math.PI) / 180)
    context.drawImage(bitmap, -width / 2, -height / 2, width, height)
    bitmap.close()
    return canvasToUrl(canvas)
  }

  async function canvasToUrl(canvas: HTMLCanvasElement): Promise<string> {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
    if (!blob) throw new Error('縮圖產生失敗')
    return URL.createObjectURL(blob)
  }

  return {
    get(page, loadedFiles) {
      const key = cacheKey(page)
      const cached = cache.get(key)
      if (cached) return Promise.resolve(cached)
      const pending = inFlight.get(key)
      if (pending) return pending

      const startedAt = generation
      const promise = schedule(async () => {
        if (startedAt !== generation) throw new Error('縮圖已作廢')
        if (page.source.kind === 'image') {
          return renderImage(page.source.blob, page.rotation)
        }
        const file = loadedFiles[page.source.fileId]
        if (!file) throw new Error(`找不到來源檔案：${page.source.fileId}`)
        return renderPdfPage(page as Page & { source: { kind: 'pdf' } }, file)
      })
        .then(url => {
          if (startedAt !== generation) {
            URL.revokeObjectURL(url)
            throw new Error('縮圖已作廢')
          }
          cache.set(key, url)
          inFlight.delete(key)
          return url
        })
        .catch(error => {
          if (startedAt === generation) inFlight.delete(key)
          throw error
        })

      inFlight.set(key, promise)
      return promise
    },

    clear() {
      generation++
      for (const url of cache.values()) URL.revokeObjectURL(url)
      cache.clear()
      inFlight.clear()
      for (const promise of documents.values()) {
        promise.then(doc => doc.destroy()).catch(() => {})
      }
      documents.clear()
    },
  }
}
