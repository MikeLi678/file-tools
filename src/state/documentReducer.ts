import type { DocumentState, LoadError, LoadedPdf, Page, Rotation } from '../types'

export type DocumentAction =
  | { type: 'load'; pages: Page[]; files: LoadedPdf[]; errors: LoadError[] }
  | { type: 'remove'; pageId: string }
  | { type: 'removeSelected' }
  | { type: 'move'; from: number; to: number }
  | { type: 'rotate'; pageId: string }
  | { type: 'toggleSelect'; pageId: string }
  | { type: 'invertSelection' }
  | { type: 'setSelectMode'; on: boolean }
  | { type: 'dismissErrors' }
  | { type: 'reset' }

export const initialDocumentState: DocumentState = {
  pages: [],
  loadedFiles: {},
  errors: [],
  selectMode: false,
}

/**
 * PDF 的原始位元組加上所有影像頁的 blob 大小。
 * 影像頁不在 loadedFiles 裡，漏算的話 200 MB 的總量上限對照片完全失效。
 */
export function totalLoadedBytes(state: DocumentState): number {
  const pdfBytes = Object.values(state.loadedFiles).reduce((sum, f) => sum + f.bytes.byteLength, 0)
  const imageBytes = state.pages.reduce(
    (sum, page) => sum + (page.source.kind === 'image' ? page.source.blob.size : 0),
    0,
  )
  return pdfBytes + imageBytes
}

/** 丟掉已經沒有任何頁面引用的 PDF，讓刪頁能真正釋放記憶體 */
function collectGarbage(pages: Page[], loadedFiles: Record<string, LoadedPdf>): Record<string, LoadedPdf> {
  const inUse = new Set(
    pages.flatMap(p => (p.source.kind === 'pdf' ? [p.source.fileId] : [])),
  )
  const kept: Record<string, LoadedPdf> = {}
  for (const [fileId, file] of Object.entries(loadedFiles)) {
    if (inUse.has(fileId)) kept[fileId] = file
  }
  return kept
}

function mapPage(state: DocumentState, pageId: string, fn: (page: Page) => Page): DocumentState {
  return { ...state, pages: state.pages.map(p => (p.id === pageId ? fn(p) : p)) }
}

export function documentReducer(state: DocumentState, action: DocumentAction): DocumentState {
  switch (action.type) {
    case 'load': {
      const loadedFiles = { ...state.loadedFiles }
      for (const file of action.files) loadedFiles[file.fileId] = file
      return {
        ...state,
        pages: [...state.pages, ...action.pages],
        loadedFiles,
        errors: action.errors,
      }
    }

    case 'remove': {
      const pages = state.pages.filter(p => p.id !== action.pageId)
      return { ...state, pages, loadedFiles: collectGarbage(pages, state.loadedFiles) }
    }

    case 'removeSelected': {
      const pages = state.pages.filter(p => !p.selected)
      // 與單頁刪除一樣要回收沒有頁面引用的 PDF，否則批次刪除反而更容易洩漏
      return { ...state, pages, loadedFiles: collectGarbage(pages, state.loadedFiles) }
    }

    case 'move': {
      const { from, to } = action
      if (from < 0 || to < 0 || from >= state.pages.length || to >= state.pages.length) return state
      const pages = [...state.pages]
      const [moved] = pages.splice(from, 1)
      pages.splice(to, 0, moved)
      return { ...state, pages }
    }

    case 'rotate':
      return mapPage(state, action.pageId, p => ({
        ...p,
        rotation: (((p.rotation + 90) % 360) as Rotation),
      }))

    case 'toggleSelect':
      return mapPage(state, action.pageId, p => ({ ...p, selected: !p.selected }))

    case 'invertSelection':
      return { ...state, pages: state.pages.map(p => ({ ...p, selected: !p.selected })) }

    case 'setSelectMode':
      return {
        ...state,
        selectMode: action.on,
        // 離開勾選模式時清空，避免殘留的勾選影響下一次匯出
        pages: action.on ? state.pages : state.pages.map(p => ({ ...p, selected: false })),
      }

    case 'dismissErrors':
      return { ...state, errors: [] }

    case 'reset':
      return initialDocumentState
  }
}
