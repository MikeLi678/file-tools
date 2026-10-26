import { describe, it, expect } from 'vitest'
import { documentReducer, initialDocumentState, totalLoadedBytes } from './documentReducer'
import type { DocumentState, LoadedPdf, Page } from '../types'

const pdfPage = (id: string, fileId: string, pageIndex: number): Page => ({
  id,
  source: { kind: 'pdf', fileId, pageIndex },
  rotation: 0,
  selected: false,
})

const loaded = (fileId: string, pageCount: number, size = 10): LoadedPdf => ({
  fileId,
  name: `${fileId}.pdf`,
  bytes: new Uint8Array(size),
  pageCount,
})

/** 一份兩頁的 a.pdf 加一份一頁的 b.pdf */
function stateWithThreePages(): DocumentState {
  return documentReducer(initialDocumentState, {
    type: 'load',
    pages: [pdfPage('p1', 'a', 0), pdfPage('p2', 'a', 1), pdfPage('p3', 'b', 0)],
    files: [loaded('a', 2), loaded('b', 1)],
    errors: [],
  })
}

describe('load', () => {
  it('把頁面附加到清單尾端並記錄檔案', () => {
    const state = stateWithThreePages()
    expect(state.pages.map(p => p.id)).toEqual(['p1', 'p2', 'p3'])
    expect(Object.keys(state.loadedFiles).sort()).toEqual(['a', 'b'])
  })

  it('第二次 load 是附加而不是取代', () => {
    const state = documentReducer(stateWithThreePages(), {
      type: 'load',
      pages: [pdfPage('p4', 'c', 0)],
      files: [loaded('c', 1)],
      errors: [],
    })
    expect(state.pages.map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
  })

  it('errors 會被這一批的結果取代，不會無限累積', () => {
    const first = documentReducer(initialDocumentState, {
      type: 'load',
      pages: [],
      files: [],
      errors: [{ fileName: 'bad.pdf', reason: 'corrupt' }],
    })
    expect(first.errors).toHaveLength(1)
    const second = documentReducer(first, { type: 'load', pages: [pdfPage('p1', 'a', 0)], files: [loaded('a', 1)], errors: [] })
    expect(second.errors).toEqual([])
  })
})

describe('move', () => {
  it('把第一頁移到最後，其餘順序不變', () => {
    const state = documentReducer(stateWithThreePages(), { type: 'move', from: 0, to: 2 })
    expect(state.pages.map(p => p.id)).toEqual(['p2', 'p3', 'p1'])
  })

  it('把最後一頁移到最前', () => {
    const state = documentReducer(stateWithThreePages(), { type: 'move', from: 2, to: 0 })
    expect(state.pages.map(p => p.id)).toEqual(['p3', 'p1', 'p2'])
  })

  it('索引超出範圍時原狀返回', () => {
    const before = stateWithThreePages()
    expect(documentReducer(before, { type: 'move', from: 0, to: 9 }).pages).toEqual(before.pages)
    expect(documentReducer(before, { type: 'move', from: -1, to: 0 }).pages).toEqual(before.pages)
  })
})

describe('remove', () => {
  it('刪除中間頁不影響其他頁', () => {
    const state = documentReducer(stateWithThreePages(), { type: 'remove', pageId: 'p2' })
    expect(state.pages.map(p => p.id)).toEqual(['p1', 'p3'])
  })

  it('a.pdf 還有頁面在用時不回收它的位元組', () => {
    const state = documentReducer(stateWithThreePages(), { type: 'remove', pageId: 'p2' })
    expect(Object.keys(state.loadedFiles).sort()).toEqual(['a', 'b'])
  })

  it('a.pdf 的最後一頁被刪掉時回收它的位元組', () => {
    let state = documentReducer(stateWithThreePages(), { type: 'remove', pageId: 'p1' })
    state = documentReducer(state, { type: 'remove', pageId: 'p2' })
    expect(Object.keys(state.loadedFiles)).toEqual(['b'])
  })
})

describe('rotate', () => {
  it('每次加 90 度', () => {
    let state = stateWithThreePages()
    state = documentReducer(state, { type: 'rotate', pageId: 'p1' })
    expect(state.pages[0].rotation).toBe(90)
    state = documentReducer(state, { type: 'rotate', pageId: 'p1' })
    expect(state.pages[0].rotation).toBe(180)
  })

  it('累加到 360 時回到 0', () => {
    let state = stateWithThreePages()
    for (let i = 0; i < 4; i++) state = documentReducer(state, { type: 'rotate', pageId: 'p1' })
    expect(state.pages[0].rotation).toBe(0)
  })

  it('只影響指定的頁', () => {
    const state = documentReducer(stateWithThreePages(), { type: 'rotate', pageId: 'p2' })
    expect(state.pages.map(p => p.rotation)).toEqual([0, 90, 0])
  })
})

describe('勾選', () => {
  it('toggleSelect 切換單一頁', () => {
    let state = documentReducer(stateWithThreePages(), { type: 'toggleSelect', pageId: 'p2' })
    expect(state.pages.map(p => p.selected)).toEqual([false, true, false])
    state = documentReducer(state, { type: 'toggleSelect', pageId: 'p2' })
    expect(state.pages.map(p => p.selected)).toEqual([false, false, false])
  })

  it('invertSelection 反轉全部', () => {
    let state = documentReducer(stateWithThreePages(), { type: 'toggleSelect', pageId: 'p1' })
    state = documentReducer(state, { type: 'invertSelection' })
    expect(state.pages.map(p => p.selected)).toEqual([false, true, true])
  })

  it('排序不影響勾選狀態跟著頁面走', () => {
    let state = documentReducer(stateWithThreePages(), { type: 'toggleSelect', pageId: 'p1' })
    state = documentReducer(state, { type: 'move', from: 0, to: 2 })
    expect(state.pages.map(p => p.id)).toEqual(['p2', 'p3', 'p1'])
    expect(state.pages.map(p => p.selected)).toEqual([false, false, true])
  })

  it('關閉勾選模式時清空所有勾選', () => {
    let state = documentReducer(stateWithThreePages(), { type: 'setSelectMode', on: true })
    state = documentReducer(state, { type: 'toggleSelect', pageId: 'p1' })
    state = documentReducer(state, { type: 'setSelectMode', on: false })
    expect(state.selectMode).toBe(false)
    expect(state.pages.every(p => !p.selected)).toBe(true)
  })
})

describe('removeSelected', () => {
  it('刪掉所有勾選的頁，未勾選的不動', () => {
    let state = stateWithThreePages()
    state = documentReducer(state, { type: 'toggleSelect', pageId: 'p1' })
    state = documentReducer(state, { type: 'toggleSelect', pageId: 'p3' })
    state = documentReducer(state, { type: 'removeSelected' })
    expect(state.pages.map(p => p.id)).toEqual(['p2'])
  })

  it('沒有任何勾選時不動', () => {
    const before = stateWithThreePages()
    const after = documentReducer(before, { type: 'removeSelected' })
    expect(after.pages.map(p => p.id)).toEqual(['p1', 'p2', 'p3'])
  })

  it('刪完某份 PDF 的所有頁時回收它的位元組', () => {
    let state = stateWithThreePages()
    // p1 與 p2 都屬於 a.pdf
    state = documentReducer(state, { type: 'toggleSelect', pageId: 'p1' })
    state = documentReducer(state, { type: 'toggleSelect', pageId: 'p2' })
    state = documentReducer(state, { type: 'removeSelected' })
    expect(Object.keys(state.loadedFiles)).toEqual(['b'])
  })

  it('不改變勾選模式本身', () => {
    let state = documentReducer(stateWithThreePages(), { type: 'setSelectMode', on: true })
    state = documentReducer(state, { type: 'toggleSelect', pageId: 'p1' })
    state = documentReducer(state, { type: 'removeSelected' })
    expect(state.selectMode).toBe(true)
  })

  it('全部勾選後刪除會清空 loadedFiles', () => {
    let state = stateWithThreePages()
    state = documentReducer(state, { type: 'invertSelection' })
    state = documentReducer(state, { type: 'removeSelected' })
    expect(state.pages).toEqual([])
    expect(state.loadedFiles).toEqual({})
  })
})

describe('totalLoadedBytes', () => {
  it('累加所有已載入 PDF 的位元組', () => {
    const state = documentReducer(initialDocumentState, {
      type: 'load',
      pages: [pdfPage('p1', 'a', 0)],
      files: [loaded('a', 1, 128), loaded('b', 1, 256)],
      errors: [],
    })
    expect(totalLoadedBytes(state)).toBe(384)
  })

  it('也要算進影像頁的 blob，否則照片完全不受總量上限約束', () => {
    const state = documentReducer(initialDocumentState, {
      type: 'load',
      pages: [
        pdfPage('p1', 'a', 0),
        { id: 'img', source: { kind: 'image', blob: new Blob([new Uint8Array(100)]) }, rotation: 0, selected: false },
      ],
      files: [loaded('a', 1, 128)],
      errors: [],
    })
    expect(totalLoadedBytes(state)).toBe(228)
  })
})

describe('reset', () => {
  it('回到初始狀態', () => {
    expect(documentReducer(stateWithThreePages(), { type: 'reset' })).toEqual(initialDocumentState)
  })
})
