import type { LoadError } from '../types'

export const LIMITS = {
  maxPages: 100,
  // 實測：186 MB 輸入在匯出時峰值到 754 MB JS heap（倍率 4-5x，同一份位元組在
  // loadedFiles、pdf.js worker、PDFDocument 物件圖、save() 輸出各存一份）。
  // iOS Safari 數百 MB 就會回收分頁，而本 app 不留存狀態，被殺即全部歸零。
  maxFileBytes: 25 * 1024 * 1024,
  maxTotalBytes: 80 * 1024 * 1024,
  thumbnailWidth: 200,
  thumbnailMaxScale: 2,
  // 定位畫面的頁面預覽寬度。刻意不重用 signatureCaptureEdge：兩者只是巧合同值，
  // 一個是預覽寬、一個是簽名裁切長邊，日後改其中一邊不該連動另一邊。
  placerPreviewWidth: 1200,
  thumbnailConcurrency: 3,
  jpegQuality: 0.85,
  maxCaptureEdge: 2400,
  // 轉圖片的輸出長邊。A4 約 170dpi，對分享用的圖片足夠。
  // 比 maxCaptureEdge 小是因為轉圖片會一次處理多頁，記憶體壓力更大。
  imageExportEdge: 2000,
  // 一次最多轉幾頁為圖片。依據是「實測 20 頁 JPEG 約 16 MB（掃描件）到 47 MB（高解析照片），加上 iOS 多檔分享的開銷
  // 應該還在安全範圍」——iOS 的多檔分享實際上限未經驗證，已列入真機測試清單。
  maxImageExportPages: 20,
  // 簽名是少量重複使用的個人資產，不是檔案庫。滿了要先刪一個
  maxStoredSignatures: 5,
  // 防手滑連點。一頁要蓋超過 5 個簽名不是正常情境
  maxOverlaysPerPage: 5,
  // 簽名裁切後的長邊。簽名是線條不是照片，1200px 在 A4 上
  // 放大到四分之一頁寬仍然銳利，透明 PNG 約數十 KB
  signatureCaptureEdge: 1200,
  // IndexedDB 的防爆護欄。1200px 的透明 PNG 遠低於此
  maxSignatureBytes: 2 * 1024 * 1024,
  // 邊緣偵測的工作解析度長邊。maxCaptureEdge 是 2400，在那個尺寸上跑
  // Sobel 與 Hough 太慢；降到 320px 之後約 7.7 萬像素，原型實測全流程 12-31ms。
  // 座標最後乘回原始尺寸，一格對應原圖 3-7px，而使用者本來就要微調，足夠。
  detectWorkEdge: 320,
  // 取梯度最強的前 8% 當邊緣點。用百分位而非固定門檻，所以會自動適應對比
  detectEdgePercentile: 0.08,
  // 偵測前的 box blur 半徑，用來壓感光雜訊
  detectBlurRadius: 2,
  // Hough 的 theta 格數，即 1 度一格
  detectThetaSteps: 180,
  // 取前 40 條峰值。原型實測文件四邊分數 5-6 萬、雜訊約 4 千，40 條綽綽有餘
  detectMaxLines: 40,
  // 裁切時放大鏡的倍率
  magnifierScale: 3,
} as const

export type IncomingFile = {
  fileName: string
  bytes: number
  pageCount: number
}

export type LimitCheckInput = {
  currentPageCount: number
  currentTotalBytes: number
  incoming: IncomingFile[]
}

export type LimitCheckResult = {
  accepted: IncomingFile[]
  rejected: LoadError[]
}

/**
 * 逐檔依序判定。拒絕某一檔不會中斷後續檔案的判定，
 * 因為後面可能有小檔仍然放得進去。
 */
export function checkLimits(input: LimitCheckInput): LimitCheckResult {
  const accepted: IncomingFile[] = []
  const rejected: LoadError[] = []
  let pages = input.currentPageCount
  let bytes = input.currentTotalBytes

  for (const file of input.incoming) {
    if (file.bytes > LIMITS.maxFileBytes) {
      rejected.push({ fileName: file.fileName, reason: 'file-too-large' })
      continue
    }
    if (pages + file.pageCount > LIMITS.maxPages) {
      rejected.push({ fileName: file.fileName, reason: 'limit-pages' })
      continue
    }
    if (bytes + file.bytes > LIMITS.maxTotalBytes) {
      rejected.push({ fileName: file.fileName, reason: 'limit-total-bytes' })
      continue
    }
    pages += file.pageCount
    bytes += file.bytes
    accepted.push(file)
  }

  return { accepted, rejected }
}
