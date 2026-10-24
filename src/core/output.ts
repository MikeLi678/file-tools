export type ExportedFile = {
  blob: Blob
  fileName: string
  pageCount: number
}

const pad = (value: number) => String(value).padStart(2, '0')

/** 全 ASCII 檔名，避免某些系統處理中文檔名時出錯 */
export function outputFileName(date: Date, extension: 'pdf' | 'jpg'): string {
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`
  return `file-tools-${stamp}.${extension}`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function toFile(file: ExportedFile): File {
  const type = file.fileName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
  return new File([file.blob], file.fileName, { type })
}

export function canShareFiles(file: ExportedFile): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false
  try {
    return navigator.canShare({ files: [toFile(file)] })
  } catch {
    return false
  }
}

/**
 * 必須從使用者點擊的同步呼叫鏈內被呼叫。
 * 若先 await 產生檔案再呼叫，Safari 會判定非使用者觸發而拒絕，
 * 所以 UI 的流程是「匯出 -> 結果畫面 -> 使用者再點一次」。
 */
export async function shareFile(file: ExportedFile): Promise<'shared' | 'cancelled' | 'downloaded'> {
  if (canShareFiles(file)) {
    try {
      await navigator.share({ files: [toFile(file)] })
      return 'shared'
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled'
      // 分享失敗時不讓使用者卡住，退回下載
    }
  }

  const url = URL.createObjectURL(file.blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // 立刻 revoke 會讓部分瀏覽器來不及開始下載
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
