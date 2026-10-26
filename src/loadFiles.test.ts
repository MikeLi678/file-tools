import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadIncomingFiles } from './loadFiles'
import { initialDocumentState } from './state/documentReducer'
import type { DocumentState, Page } from './types'

const threePages = readFileSync(join(__dirname, '../tests/fixtures/three-pages.pdf'))

const pdfFile = (name: string) => new File([threePages], name, { type: 'application/pdf' })

function stateWithPages(count: number): DocumentState {
  const pages: Page[] = Array.from({ length: count }, (_, i) => ({
    id: `existing-${i}`,
    source: { kind: 'pdf', fileId: 'existing', pageIndex: i },
    rotation: 0,
    selected: false,
    overlays: [],
  }))
  return { ...initialDocumentState, pages }
}

describe('loadIncomingFiles 的上限判定', () => {
  it('兩個同名檔案不會一起繞過頁數上限', async () => {
    // 已有 97 頁。兩份同名的 3 頁 PDF：第一份剛好填滿 100 頁，第二份必須被拒
    const action = await loadIncomingFiles([pdfFile('scan.pdf'), pdfFile('scan.pdf')], stateWithPages(97))
    expect(action.pages).toHaveLength(3)
    expect(action.files).toHaveLength(1)
    expect(action.errors).toEqual([{ fileName: 'scan.pdf', reason: 'limit-pages' }])
  })

  it('同名檔案都放得下時兩份都收，各自獨立', async () => {
    const action = await loadIncomingFiles([pdfFile('scan.pdf'), pdfFile('scan.pdf')], initialDocumentState)
    expect(action.pages).toHaveLength(6)
    expect(action.files).toHaveLength(2)
    // 兩份必須有不同的 fileId，否則第二份會覆蓋第一份
    expect(action.files[0].fileId).not.toBe(action.files[1].fileId)
    expect(action.errors).toEqual([])
  })

  it('壞檔與好檔同名時，好檔仍然載入', async () => {
    const corrupt = new File([readFileSync(join(__dirname, '../tests/fixtures/corrupt.pdf'))], 'scan.pdf', {
      type: 'application/pdf',
    })
    const action = await loadIncomingFiles([pdfFile('scan.pdf'), corrupt], initialDocumentState)
    expect(action.pages).toHaveLength(3)
    expect(action.errors).toEqual([{ fileName: 'scan.pdf', reason: 'corrupt' }])
  })

  it('單一檔案讀取失敗時，同批的好檔仍然載入', async () => {
    const broken = new File([new Uint8Array(10)], 'broken.pdf', { type: 'application/pdf' })
    Object.defineProperty(broken, 'arrayBuffer', {
      value: () => Promise.reject(new DOMException('讀取失敗', 'NotReadableError')),
    })
    const action = await loadIncomingFiles([pdfFile('good.pdf'), broken], initialDocumentState)
    expect(action.pages).toHaveLength(3)
    expect(action.errors).toEqual([{ fileName: 'broken.pdf', reason: 'corrupt' }])
  })
})
