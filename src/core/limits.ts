import type { LoadError } from '../types'

export const LIMITS = {
  maxPages: 100,
  maxFileBytes: 50 * 1024 * 1024,
  maxTotalBytes: 200 * 1024 * 1024,
  thumbnailWidth: 200,
  thumbnailMaxScale: 2,
  thumbnailConcurrency: 3,
  jpegQuality: 0.85,
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
