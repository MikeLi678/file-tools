import { checkLimits, LIMITS } from './core/limits'
import type { IncomingFile } from './core/limits'
import { loadPdf } from './core/pdfLoader'
import { detectImageType } from './core/imageToPage'
import { totalLoadedBytes } from './state/documentReducer'
import { newId } from './ids'
import type { DocumentState, LoadError, LoadErrorReason, LoadedPdf, Page } from './types'
import type { DocumentAction } from './state/documentReducer'

export const ERROR_MESSAGES: Record<LoadErrorReason, string> = {
  encrypted: '此 PDF 有密碼保護，無法處理',
  corrupt: '此檔案無法讀取，可能已損壞',
  empty: '此 PDF 沒有任何頁面',
  'decode-failed': '此照片格式無法處理，請改用 JPEG 或 PNG',
  'file-too-large': `單一檔案不能超過 ${LIMITS.maxFileBytes / 1024 / 1024} MB`,
  'limit-pages': `加入後會超過 ${LIMITS.maxPages} 頁的上限`,
  'limit-total-bytes': `加入後會超過 ${LIMITS.maxTotalBytes / 1024 / 1024} MB 的總量上限`,
}

type LoadPayload = Extract<DocumentAction, { type: 'load' }>

/**
 * 把使用者選的檔案轉成一個 load action。
 * 先讀取並得知每份 PDF 的頁數，才能做頁數上限的判定，
 * 所以順序是「全部讀完 -> 檢查上限 -> 組出 action」。
 */
type PendingEntry =
  | { kind: 'pdf'; incoming: IncomingFile; file: LoadedPdf }
  | { kind: 'image'; incoming: IncomingFile; blob: Blob }

export async function loadIncomingFiles(files: File[], state: DocumentState): Promise<LoadPayload> {
  const errors: LoadError[] = []
  const pdfs: PendingEntry[] = []
  const images: PendingEntry[] = []

  for (const file of files) {
    // 先用 size 擋掉超大檔案，避免整個讀進記憶體才被拒絕
    if (file.size > LIMITS.maxFileBytes) {
      errors.push({ fileName: file.name, reason: 'file-too-large' })
      continue
    }

    let bytes: Uint8Array
    try {
      bytes = new Uint8Array(await file.arrayBuffer())
    } catch {
      // iOS 上尚未下載的 iCloud 檔案、或讀取途中被系統回收的相簿照片會走到這裡。
      // 不接住的話整批 reject，使用者看到的是「按了沒反應」。
      errors.push({ fileName: file.name, reason: 'corrupt' })
      continue
    }

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const result = await loadPdf(newId(), file.name, bytes)
      if (result.ok) {
        pdfs.push({
          kind: 'pdf',
          file: result.file,
          incoming: { fileName: file.name, bytes: bytes.byteLength, pageCount: result.file.pageCount },
        })
      } else errors.push(result.error)
      continue
    }

    // HEIC 等瀏覽器不一定能解碼的格式，在這裡就先試一次 decode。
    // iOS Safari 走系統解碼器可以過，Android Chrome 會失敗。
    const decodable = detectImageType(bytes) !== 'unknown' || (await canDecode(file))
    if (!decodable) {
      errors.push({ fileName: file.name, reason: 'decode-failed' })
      continue
    }
    images.push({
      kind: 'image',
      blob: file,
      incoming: { fileName: file.name, bytes: bytes.byteLength, pageCount: 1 },
    })
  }

  // PDF 在前、影像在後；checkLimits 依序判定
  const entries = [...pdfs, ...images]
  const check = checkLimits({
    currentPageCount: state.pages.length,
    currentTotalBytes: totalLoadedBytes(state),
    incoming: entries.map(entry => entry.incoming),
  })

  // 用物件參考而非檔名比對——同名檔案必須能被分別判定
  const acceptedSet = new Set(check.accepted)
  const pages: Page[] = []
  const acceptedFiles: LoadedPdf[] = []

  for (const entry of entries) {
    if (!acceptedSet.has(entry.incoming)) continue
    if (entry.kind === 'pdf') {
      acceptedFiles.push(entry.file)
      for (let i = 0; i < entry.file.pageCount; i++) {
        pages.push({ id: newId(), source: { kind: 'pdf', fileId: entry.file.fileId, pageIndex: i }, rotation: 0, selected: false })
      }
    } else {
      pages.push({ id: newId(), source: { kind: 'image', blob: entry.blob }, rotation: 0, selected: false })
    }
  }

  return { type: 'load', pages, files: acceptedFiles, errors: [...errors, ...check.rejected] }
}

async function canDecode(file: File): Promise<boolean> {
  try {
    const bitmap = await createImageBitmap(file)
    bitmap.close()
    return true
  } catch {
    return false
  }
}
