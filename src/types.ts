export type Rotation = 0 | 90 | 180 | 270

/** 蓋在頁面上的簽名。座標在未旋轉的頁面空間，0..1 正規化 */
export type SignatureOverlay = {
  id: string
  signatureId: string
  /** 左上角 x，佔未旋轉頁寬的比例 */
  x: number
  /** 左上角 y，佔未旋轉頁高的比例，由上往下 */
  y: number
  /** 寬度佔未旋轉頁寬的比例。高度由簽名長寬比算出，不另存 */
  width: number
}

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
  /** 蓋在這一頁上的簽名。座標是未旋轉空間，所以旋轉頁面時不需要改動 */
  overlays: SignatureOverlay[]
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
  | 'limit-image-pages'

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
