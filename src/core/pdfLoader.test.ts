import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadPdf } from './pdfLoader'

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '../../tests/fixtures', name)))

describe('loadPdf', () => {
  it('讀入正常的三頁 PDF 並回報頁數', async () => {
    const result = await loadPdf('f1', 'three-pages.pdf', fixture('three-pages.pdf'))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.pageCount).toBe(3)
    expect(result.file.fileId).toBe('f1')
    expect(result.file.name).toBe('three-pages.pdf')
  })

  it('加密的 PDF 回報 encrypted', async () => {
    const result = await loadPdf('f2', 'encrypted.pdf', fixture('encrypted.pdf'))
    expect(result).toEqual({ ok: false, error: { fileName: 'encrypted.pdf', reason: 'encrypted' } })
  })

  it('損壞的 PDF 回報 corrupt', async () => {
    const result = await loadPdf('f3', 'corrupt.pdf', fixture('corrupt.pdf'))
    expect(result).toEqual({ ok: false, error: { fileName: 'corrupt.pdf', reason: 'corrupt' } })
  })

  it('零頁的 PDF 回報 empty', async () => {
    const result = await loadPdf('f4', 'empty.pdf', fixture('empty.pdf'))
    expect(result).toEqual({ ok: false, error: { fileName: 'empty.pdf', reason: 'empty' } })
  })

  it('保留原始位元組供後續匯出使用', async () => {
    const bytes = fixture('three-pages.pdf')
    const result = await loadPdf('f5', 'three-pages.pdf', bytes)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.file.bytes.byteLength).toBe(bytes.byteLength)
  })
})
