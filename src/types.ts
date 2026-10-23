export type Rotation = 0 | 90 | 180 | 270

export type PageSource =
  | { kind: 'pdf'; fileId: string; pageIndex: number }
  | { kind: 'image'; blob: Blob }

export type Page = {
  id: string
  source: PageSource
  /** 使用者施加的相對旋轉，不是絕對角度 */
  rotation: Rotation
  /** 抽頁與分割用的勾選狀態 */
  selected: boolean
}

export type LoadedPdf = {
  fileId: string
  name: string
  bytes: Uint8Array
  pageCount: number
}

export type LoadErrorReason =
  | 'encrypted'
  | 'corrupt'
  | 'empty'
  | 'decode-failed'
  | 'file-too-large'
  | 'limit-pages'
  | 'limit-total-bytes'

export type LoadError = {
  fileName: string
  reason: LoadErrorReason
}

export type DocumentState = {
  pages: Page[]
  loadedFiles: Record<string, LoadedPdf>
  errors: LoadError[]
  selectMode: boolean
}

/** 與 DOM ImageData 結構相容，但可在 Node 下建構 */
export type RasterImage = {
  width: number
  height: number
  data: Uint8ClampedArray
}
