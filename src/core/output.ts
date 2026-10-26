import { LIMITS } from './limits'
import type { Rotation } from '../types'

export type ExportedFile = {
  blob: Blob
  fileName: string
  pageCount: number
}

const pad = (value: number) => String(value).padStart(2, '0')

/**
 * 全 ASCII 檔名，避免某些系統處理中文檔名時出錯。
 * index 有值時加在副檔名之前，用於一次匯出多個檔案的情境。
 */
export function outputFileName(date: Date, extension: 'pdf' | 'jpg', index?: number): string {
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
  const suffix = index === undefined ? '' : `-${index}`
  return `file-tools-${stamp}${suffix}.${extension}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** 檔名長度上限。超過的部分截斷，避免某些系統處理超長檔名時出錯 */
const MAX_FILE_NAME_LENGTH = 80

/**
 * 把使用者輸入的檔名整理成可用的形式。
 *
 * 過濾的是 Windows 與 macOS 都不允許的字元加上控制字元——即使這個 app 只跑在
 * iOS 上，檔案會被分享出去到別的系統，所以用最嚴格的那一套。
 * 留空或全是被過濾掉的字元時退回預設檔名，不報錯。
 */
export function sanitizeFileName(input: string, fallback: string): string {
  const cleaned = input
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '')
    .slice(0, MAX_FILE_NAME_LENGTH)
    // 前後的點號與空白要在截斷「之後」再清一次：
    // 開頭的點號會變成隱藏檔（而這個功能存在的理由就是讓檔案找得到），
    // 結尾的點號與空白在 Windows 上會被靜默吃掉，
    // 而截斷本身也可能讓結尾剛好落在空白或點號上。
    .replace(/^[.\s]+|[.\s]+$/g, '')
  return cleaned.length > 0 ? cleaned : fallback
}

function toFile(file: ExportedFile): File {
  const type = file.fileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
  return new File([file.blob], file.fileName, { type })
}

export function canShareFiles(files: ExportedFile[]): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false
  try {
    return navigator.canShare({ files: files.map(toFile) })
  } catch {
    return false
  }
}

/**
 * 必須從使用者點擊的同步呼叫鏈內被呼叫。
 * 若先 await 產生檔案再呼叫，Safari 會判定非使用者觸發而拒絕，
 * 所以 UI 的流程是「匯出 -> 結果畫面 -> 使用者再點一次」。
 *
 * 單檔是多檔的特例。不支援多檔分享時退回逐個下載。
 */
export async function shareFiles(files: ExportedFile[]): Promise<'shared' | 'cancelled' | 'downloaded'> {
  if (files.length === 0) throw new Error('沒有可分享的檔案')

  if (canShareFiles(files)) {
    try {
      await navigator.share({ files: files.map(toFile) })
      return 'shared'
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
      // 分享失敗時不讓使用者卡住，退回下載
    }
  }

  for (const file of files) {
    const url = URL.createObjectURL(file.blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.fileName
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    // 立刻 revoke 會讓部分瀏覽器來不及開始下載。iOS Safari 對大檔會先跳確認框，
    // 太早 revoke 會讓使用者點下去時下載失敗，所以放寬到 60 秒。
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  return 'downloaded'
}

/**
 * 把影像 blob 依旋轉重繪成真正的 JPEG。
 *
 * 不能直接把來源 blob 當輸出：來源可能是 PNG（命名成 .jpg 會內容與副檔名不符），
 * 而且使用者施加的旋轉完全不會反映出來，與「旋轉後匯出 PDF」的行為不一致。
 */
export async function renderImageToJpeg(
  blob: Blob,
  rotation: Rotation,
  targetEdge?: number,
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  const swap = rotation === 90 || rotation === 270
  const sourceWidth = swap ? bitmap.height : bitmap.width
  const sourceHeight = swap ? bitmap.width : bitmap.height
  // targetEdge 只有批次轉圖片會傳。單張匯出維持原尺寸，不改變既有行為。
  const scale = targetEdge ? Math.min(1, targetEdge / Math.max(sourceWidth, sourceHeight)) : 1

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sourceWidth * scale))
  canvas.height = Math.max(1, Math.round(sourceHeight * scale))

  try {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('無法取得 canvas context')
    // 白底，否則 PNG 的透明區域在 JPEG 會變成黑色
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.translate(canvas.width / 2, canvas.height / 2)
    context.rotate((rotation * Math.PI) / 180)
    context.drawImage(
      bitmap,
      (-bitmap.width * scale) / 2,
      (-bitmap.height * scale) / 2,
      bitmap.width * scale,
      bitmap.height * scale,
    )

    const output = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/jpeg', LIMITS.jpegQuality),
    )
    if (!output) throw new Error('影像輸出失敗')
    return output
  } finally {
    bitmap.close()
    // 批次路徑會連續呼叫 20 次，不歸零的話 backing store 會堆著等 GC
    canvas.width = 0
    canvas.height = 0
  }
}
