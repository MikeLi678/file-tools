import { PDFDocument, EncryptedPDFError } from 'pdf-lib'
import type { LoadError, LoadedPdf } from '../types'

export type LoadResult =
  | { ok: true; file: LoadedPdf }
  | { ok: false; error: LoadError }

/**
 * 讀入一份 PDF 並回報頁數。
 * 不解析整份文件結構到記憶體裡長駐——解析結果用完即丟，
 * 長期保留的只有原始位元組，匯出時再重新解析。
 */
export async function loadPdf(fileId: string, fileName: string, bytes: Uint8Array): Promise<LoadResult> {
  let doc: PDFDocument
  try {
    doc = await PDFDocument.load(bytes)
  } catch (error) {
    // 加密 PDF 判定邏輯：此版 pdf-lib (1.17.1) 對加密 PDF 拋出一般 Error，不是 EncryptedPDFError，
    // 所以 instanceof EncryptedPDFError 恆為 false。實際生效的是訊息字串比對 /encrypt/i。
    // 保留 instanceof 檢查是為了將來若 pdf-lib 改用真正的子類別時自動生效；屆時字串比對可移除。
    // 此邏輯有測試守著：pdfLoader.test.ts 的「加密的 PDF 回報 encrypted」在訊息文字改變時會變紅。
    const message = error instanceof Error ? error.message : ''
    const isEncrypted = error instanceof EncryptedPDFError || /encrypt/i.test(message)
    const reason = isEncrypted ? 'encrypted' : 'corrupt'
    return { ok: false, error: { fileName, reason } }
  }

  // 第二層異常捕獲：損壞的 PDF 在 load 階段可能完全不報錯，要到走訪頁樹時才爆出 TypeError。
  // 已知邊界：getPageCount() 內部是 this.getPages().length，若損壞 PDF 的頁樹解析成空陣列會回傳 0
  // 而不拋錯，結果被歸類成 'empty' 而不是 'corrupt'。此差別只影響使用者訊息，檔案無論如何都被拒絕。
  let pageCount: number
  try {
    pageCount = doc.getPageCount()
  } catch {
    return { ok: false, error: { fileName, reason: 'corrupt' } }
  }

  if (pageCount === 0) {
    return { ok: false, error: { fileName, reason: 'empty' } }
  }

  return { ok: true, file: { fileId, name: fileName, bytes, pageCount } }
}
