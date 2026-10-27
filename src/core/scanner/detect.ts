import { LIMITS } from '../limits'
import type { RasterImage } from '../../types'
import { boxMean } from './boxMean'

export type GrayImage = { gray: Float32Array; width: number; height: number }

export type EdgePoint = { x: number; y: number; m: number }

/**
 * 面積平均降採樣到長邊 targetEdge，順便轉成灰階。
 *
 * 用面積平均而不是取樣，因為手機影格有感光雜訊，取樣會把雜訊帶進工作影像。
 * 只縮不放：比目標小的影像維持原尺寸（放大不會增加資訊）。
 */
export function downscaleGray(img: RasterImage, targetEdge: number = LIMITS.detectWorkEdge): GrayImage {
  const scale = Math.min(1, targetEdge / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))
  const gray = new Float32Array(width * height)
  const sx = img.width / width
  const sy = img.height / height

  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy)
    const y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) * sy)))
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx)
      const x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) * sx)))
      let sum = 0
      let n = 0
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * img.width + x0) * 4
        for (let xx = x0; xx < x1; xx++, i += 4) {
          // Rec.601 的亮度加權，與 filters.ts 的 mono 一致
          sum += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
          n += 1
        }
      }
      gray[y * width + x] = sum / n
    }
  }
  return { gray, width, height }
}

/**
 * Sobel 梯度強度。用 |Gx| + |Gy| 而不是開根號——
 * 後面只拿它排序與取門檻，不需要真正的歐氏長度。
 * 邊框像素沒有完整的 3x3 鄰域，維持 0。
 */
export function sobel(gray: Float32Array, width: number, height: number): { mag: Float32Array } {
  const mag = new Float32Array(width * height)
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const a = gray[i - width - 1]
      const b = gray[i - width]
      const c = gray[i - width + 1]
      const d = gray[i - 1]
      const f = gray[i + 1]
      const g = gray[i + width - 1]
      const h = gray[i + width]
      const k = gray[i + width + 1]
      const gx = c + 2 * f + k - (a + 2 * d + g)
      const gy = g + 2 * h + k - (a + 2 * b + c)
      mag[i] = Math.abs(gx) + Math.abs(gy)
    }
  }
  return { mag }
}

/**
 * 取梯度最強的前 pct 比例當邊緣點。
 * 用百分位而非固定門檻，所以會自動適應整張影像的對比。
 */
export function edgePoints(
  mag: Float32Array,
  width: number,
  height: number,
  pct: number = LIMITS.detectEdgePercentile,
): { pts: EdgePoint[]; threshold: number } {
  const nonZero: number[] = []
  for (let i = 0; i < mag.length; i++) if (mag[i] > 0) nonZero.push(mag[i])
  if (nonZero.length === 0) return { pts: [], threshold: 0 }
  nonZero.sort((a, b) => b - a)
  const threshold = nonZero[Math.min(nonZero.length - 1, Math.floor(nonZero.length * pct))] || 1

  const pts: EdgePoint[] = []
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      if (mag[i] >= threshold) pts.push({ x, y, m: mag[i] })
    }
  }
  return { pts, threshold }
}

/** 偵測前的模糊，壓掉感光雜訊 */
export function blurGray(img: GrayImage, radius: number = LIMITS.detectBlurRadius): Float32Array {
  return boxMean(img.gray, img.width, img.height, radius)
}
