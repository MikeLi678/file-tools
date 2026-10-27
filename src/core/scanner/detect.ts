import { LIMITS } from '../limits'
import type { RasterImage } from '../../types'
import { boxMean } from './boxMean'
import { isConvexQuad, quadAngles, quadArea } from './geometry'
import type { Point, Quad } from './geometry'

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

export type HoughLine = { theta: number; rho: number; score: number }

/**
 * Hough 變換找直線峰值。theta 取 [0, PI)，rho 以 1px 一格。
 *
 * 回傳的峰值依分數由高到低排序，最多 LIMITS.detectMaxLines 條。
 */
export function houghLines(
  pts: EdgePoint[],
  width: number,
  height: number,
  thetaSteps: number = LIMITS.detectThetaSteps,
): HoughLine[] {
  if (pts.length === 0) return []

  const diag = Math.ceil(Math.hypot(width, height))
  const rhoBins = diag * 2 + 1
  const acc = new Float32Array(thetaSteps * rhoBins)
  const cos = new Float32Array(thetaSteps)
  const sin = new Float32Array(thetaSteps)
  for (let t = 0; t < thetaSteps; t++) {
    const a = (t * Math.PI) / thetaSteps
    cos[t] = Math.cos(a)
    sin[t] = Math.sin(a)
  }

  for (const p of pts) {
    for (let t = 0; t < thetaSteps; t++) {
      const rho = Math.round(p.x * cos[t] + p.y * sin[t]) + diag
      acc[t * rhoBins + rho] += p.m
    }
  }

  const peaks: HoughLine[] = []
  const rhoNms = Math.max(6, Math.round(diag * 0.04))
  const thetaNms = 8

  for (let t = 0; t < thetaSteps; t++) {
    for (let r = 0; r < rhoBins; r++) {
      const v = acc[t * rhoBins + r]
      if (v <= 0) continue
      let isMax = true
      for (let dt = -thetaNms; dt <= thetaNms && isMax; dt++) {
        const raw = t + dt
        const tt = ((raw % thetaSteps) + thetaSteps) % thetaSteps
        // theta 以 180 度為週期，而 (theta, rho) 與 (theta+180, -rho) 是同一條線。
        // 繞過邊界時 rho 要鏡射，否則同一條線會留下兩個峰值，
        // 而它們的「中心偏移」正負相反，會把後面的選線完全帶歪。
        // 原型實測：未處理時六個測試案例全部驗證失敗（四角落在畫面外）。
        const wrapped = raw < 0 || raw >= thetaSteps
        const base = wrapped ? rhoBins - 1 - r : r
        for (let dr = -rhoNms; dr <= rhoNms; dr++) {
          const rr = base + dr
          if (rr < 0 || rr >= rhoBins) continue
          if (acc[tt * rhoBins + rr] > v) {
            isMax = false
            break
          }
        }
      }
      if (isMax) peaks.push({ theta: (t * Math.PI) / thetaSteps, rho: r - diag, score: v })
    }
  }

  peaks.sort((a, b) => b.score - a.score)
  return peaks.slice(0, LIMITS.detectMaxLines)
}

function intersect(l1: HoughLine, l2: HoughLine): Point | null {
  const det = Math.cos(l1.theta) * Math.sin(l2.theta) - Math.sin(l1.theta) * Math.cos(l2.theta)
  if (Math.abs(det) < 1e-9) return null
  return {
    x: (l1.rho * Math.sin(l2.theta) - l2.rho * Math.sin(l1.theta)) / det,
    y: (l2.rho * Math.cos(l1.theta) - l1.rho * Math.cos(l2.theta)) / det,
  }
}

/**
 * 把直線分成近水平與近垂直兩族，各挑兩條，交出四角。
 * 順序是左上、右上、右下、左下，與 Quad 的約定一致。
 */
export function quadFromLines(lines: HoughLine[], width: number, height: number): Quad | null {
  // (theta, rho) 與 (theta-180, -rho) 是同一條線，但法向量方向相反，
  // 所以「帶正負號的中心偏移」只在 theta 相近時才可比較。
  // 近垂直的線會分別落在 theta≈0 與 theta≈180 兩端，必須先統一到
  // (-90, 90] 這個區間，否則文件左右兩邊的偏移符號會整個翻轉。
  // 原型實測：未統一時旋轉 8 度的案例算出 593px 的角誤差。
  const canonVertical = (l: HoughLine): HoughLine =>
    l.theta > Math.PI / 2 ? { ...l, theta: l.theta - Math.PI, rho: -l.rho } : l

  const horiz: HoughLine[] = []
  const vert: HoughLine[] = []
  for (const l of lines) {
    // theta 是法向量角度：接近 90 度表示這條線近水平
    const deg = (l.theta * 180) / Math.PI
    if (deg > 45 && deg < 135) horiz.push(l)
    else vert.push(canonVertical(l))
  }
  if (horiz.length < 2 || vert.length < 2) return null

  const cx = width / 2
  const cy = height / 2
  /** 畫面中心到這條線的帶正負號距離 */
  const offset = (l: HoughLine) => l.rho - (cx * Math.cos(l.theta) + cy * Math.sin(l.theta))

  // 按分數挑，而不是取最外側。文件四邊是畫面上最強的直線（原型實測分數
  // 5-6 萬，雜訊約 4 千），取最外側反而會抓到角落雜訊或重複峰值。
  // 同時要求兩條線分別在中心的兩側——使用者會把文件大致放在畫面中間，
  // 這個條件能擋掉「兩條都在同一邊」的退化解。
  const minGap = Math.min(width, height) * 0.15
  const pick = (arr: HoughLine[]): [HoughLine, HoughLine] | null => {
    const byScore = [...arr].sort((a, b) => b.score - a.score)
    const neg = byScore.find(l => offset(l) < 0)
    const pos = byScore.find(l => offset(l) > 0)
    if (!neg || !pos) return null
    if (Math.abs(offset(pos) - offset(neg)) < minGap) return null
    return [neg, pos]
  }

  const hPair = pick(horiz)
  const vPair = pick(vert)
  if (!hPair || !vPair) return null
  const [hTop, hBot] = hPair
  const [vLeft, vRight] = vPair

  const tl = intersect(hTop, vLeft)
  const tr = intersect(hTop, vRight)
  const br = intersect(hBot, vRight)
  const bl = intersect(hBot, vLeft)
  if (!tl || !tr || !br || !bl) return null
  return [tl, tr, br, bl]
}

export type QuadValidation = { ok: true; areaRatio: number } | { ok: false; why: string }

/** 偵測結果最小的短邊。再小就沒有足夠的邊緣資訊 */
const MIN_DETECT_EDGE = 32
/** 容許角點超出畫面的比例。透視時角點可能略微出框 */
const OUT_OF_FRAME_MARGIN = 0.08
const MIN_ANGLE = 50
const MAX_ANGLE = 130
const MIN_AREA_RATIO = 0.15
const MAX_AREA_RATIO = 1.05

/**
 * 一個錯得很自信的框比沒有偵測更糟——使用者會以為那就是文件邊界。
 * 所以任何一項不過就回傳失敗，讓呼叫端退回預設框。
 */
export function validateQuad(quad: Quad | null, width: number, height: number): QuadValidation {
  if (!quad) return { ok: false, why: '沒有偵測到四邊形' }

  const margin = Math.max(width, height) * OUT_OF_FRAME_MARGIN
  for (const p of quad) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return { ok: false, why: '角點座標不是有限數' }
    if (p.x < -margin || p.y < -margin || p.x > width + margin || p.y > height + margin) {
      return { ok: false, why: '角點超出畫面' }
    }
  }
  if (!isConvexQuad(quad)) return { ok: false, why: '不是凸四邊形' }

  const angles = quadAngles(quad)
  for (const a of angles) {
    if (a < MIN_ANGLE || a > MAX_ANGLE) return { ok: false, why: `內角過於極端（${a.toFixed(0)} 度）` }
  }

  const areaRatio = quadArea(quad) / (width * height)
  if (areaRatio < MIN_AREA_RATIO) return { ok: false, why: `面積過小（${(areaRatio * 100).toFixed(1)}%）` }
  if (areaRatio > MAX_AREA_RATIO) return { ok: false, why: `面積過大（${(areaRatio * 100).toFixed(1)}%）` }

  return { ok: true, areaRatio }
}

/**
 * 偵測影像裡的文件四角。偵測不到或結果不合理時回傳 null，
 * 呼叫端應退回 defaultQuad 並告知使用者那是預設框。
 *
 * 回傳的座標是原始影像的像素座標。
 */
export function detectDocumentQuad(img: RasterImage): Quad | null {
  if (Math.min(img.width, img.height) < MIN_DETECT_EDGE) return null

  const small = downscaleGray(img)
  const blurred = blurGray(small)
  const { mag } = sobel(blurred, small.width, small.height)
  const { pts } = edgePoints(mag, small.width, small.height)
  if (pts.length === 0) return null

  const lines = houghLines(pts, small.width, small.height)
  const quadSmall = quadFromLines(lines, small.width, small.height)
  const check = validateQuad(quadSmall, small.width, small.height)
  if (!check.ok || !quadSmall) return null

  // 工作解析度的座標乘回原始尺寸
  const sx = img.width / small.width
  const sy = img.height / small.height
  return quadSmall.map(p => ({ x: p.x * sx, y: p.y * sy })) as Quad
}
