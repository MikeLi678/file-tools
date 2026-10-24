import type { RasterImage } from '../../types'

export type Point = { x: number; y: number }
/** 固定順序：左上、右上、右下、左下 */
export type Quad = [Point, Point, Point, Point]

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export function estimateOutputSize(quad: Quad): { width: number; height: number } {
  const [tl, tr, br, bl] = quad
  const width = Math.max(distance(tl, tr), distance(bl, br))
  const height = Math.max(distance(tl, bl), distance(tr, br))
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  }
}

/**
 * 解出把 src 四角映射到 dst 四角的 3x3 透視矩陣（row-major，h8 固定為 1）。
 * 四組對應點給出 8 條線性方程式，用高斯消去法解 8 個未知數。
 */
export function solveHomography(src: Quad, dst: Quad): number[] {
  const matrix: number[][] = []
  const rhs: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i]
    const { x: u, y: v } = dst[i]
    matrix.push([x, y, 1, 0, 0, 0, -x * u, -y * u])
    rhs.push(u)
    matrix.push([0, 0, 0, x, y, 1, -x * v, -y * v])
    rhs.push(v)
  }
  const h = gaussianSolve(matrix, rhs)
  return [...h, 1]
}

function gaussianSolve(a: number[][], b: number[]): number[] {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row
    }
    if (Math.abs(m[pivot][col]) < 1e-10) {
      throw new Error('四角退化，無法求解透視矩陣')
    }
    ;[m[col], m[pivot]] = [m[pivot], m[col]]

    const scale = m[col][col]
    for (let c = col; c <= n; c++) m[col][c] /= scale

    for (let row = 0; row < n; row++) {
      if (row === col) continue
      const factor = m[row][col]
      if (factor === 0) continue
      for (let c = col; c <= n; c++) m[row][c] -= factor * m[col][c]
    }
  }

  return m.map(row => row[n])
}

export function applyHomography(h: number[], p: Point): Point {
  const w = h[6] * p.x + h[7] * p.y + h[8]
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  }
}

function sampleAt(img: RasterImage, x: number, y: number, channel: number): number {
  const cx = Math.min(img.width - 1, Math.max(0, x))
  const cy = Math.min(img.height - 1, Math.max(0, y))
  return img.data[(cy * img.width + cx) * 4 + channel]
}

/**
 * 把 src 影像中由 quad 圍出的四邊形區域，拉正成 outW x outH 的矩形。
 * 矩陣求的是「輸出座標 -> 來源座標」，因此對每個輸出像素反向取樣，
 * 不會留下未填滿的洞。超出來源邊界的取樣夾到邊緣。
 */
export function warpPerspective(src: RasterImage, quad: Quad, outW: number, outH: number): RasterImage {
  const destQuad: Quad = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ]
  const h = solveHomography(destQuad, quad)
  const data = new Uint8ClampedArray(outW * outH * 4)

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const s = applyHomography(h, { x, y })
      const x0 = Math.floor(s.x)
      const y0 = Math.floor(s.y)
      const dx = s.x - x0
      const dy = s.y - y0
      const offset = (y * outW + x) * 4
      for (let c = 0; c < 4; c++) {
        const p00 = sampleAt(src, x0, y0, c)
        const p10 = sampleAt(src, x0 + 1, y0, c)
        const p01 = sampleAt(src, x0, y0 + 1, c)
        const p11 = sampleAt(src, x0 + 1, y0 + 1, c)
        data[offset + c] = Math.round(
          p00 * (1 - dx) * (1 - dy) + p10 * dx * (1 - dy) + p01 * (1 - dx) * dy + p11 * dx * dy,
        )
      }
    }
  }

  return { width: outW, height: outH, data }
}
