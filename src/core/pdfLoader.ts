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
    const message = error instanceof Error ? error.message : ''
    const isEncrypted = error instanceof EncryptedPDFError || /encrypt/i.test(message)
    const reason = isEncrypted ? 'encrypted' : 'corrupt'
    return { ok: false, error: { fileName, reason } }
  }

  let pageCount: number
  try {
    pageCount = doc.getPageCount()
  } catch (error) {
    return { ok: false, error: { fileName, reason: 'corrupt' } }
  }

  if (pageCount === 0) {
    return { ok: false, error: { fileName, reason: 'empty' } }
  }

  return { ok: true, file: { fileId, name: fileName, bytes, pageCount } }
}
