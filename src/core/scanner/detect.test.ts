import { describe, expect, it } from 'vitest'
import { downscaleGray, edgePoints, sobel } from './detect'
import type { RasterImage } from '../../types'

/** 建一張 RGBA 影像，pixel(x, y) 回傳 0-255 的灰階值 */
function makeImage(width: number, height: number, pixel: (x: number, y: number) => number): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = pixel(x, y)
      const i = (y * width + x) * 4
      data[i] = v
      data[i + 1] = v
      data[i + 2] = v
      data[i + 3] = 255
    }
  }
  return { width, height, data }
}

describe('downscaleGray', () => {
  it('長邊縮到目標尺寸，長寬比不變', () => {
    const img = makeImage(800, 400, () => 128)
    const out = downscaleGray(img, 200)
    expect(out.width).toBe(200)
    expect(out.height).toBe(100)
  })

  it('比目標小的影像不放大', () => {
    const img = makeImage(100, 50, () => 128)
    const out = downscaleGray(img, 320)
    expect(out.width).toBe(100)
    expect(out.height).toBe(50)
  })

  it('純色影像降採樣後每個像素都是同一個灰階', () => {
    const img = makeImage(400, 400, () => 200)
    const out = downscaleGray(img, 100)
    for (let i = 0; i < out.gray.length; i++) expect(out.gray[i]).toBeCloseTo(200, 4)
  })

  it('用面積平均，不是取樣', () => {
    // 棋盤格降採樣 2 倍之後每格應該是 (0+255)/2
    const img = makeImage(4, 4, (x, y) => ((x + y) % 2 === 0 ? 0 : 255))
    const out = downscaleGray(img, 2)
    expect(out.width).toBe(2)
    for (let i = 0; i < out.gray.length; i++) expect(out.gray[i]).toBeCloseTo(127.5, 1)
  })

  it('依 Rec.601 加權轉灰階', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255])
    const out = downscaleGray({ width: 1, height: 1, data }, 10)
    expect(out.gray[0]).toBeCloseTo(0.299 * 255, 3)
  })

  it('寬高至少是 1', () => {
    const img = makeImage(100, 3, () => 50)
    const out = downscaleGray(img, 10)
    expect(out.width).toBeGreaterThanOrEqual(1)
    expect(out.height).toBeGreaterThanOrEqual(1)
  })
})

describe('sobel', () => {
  it('純色影像沒有梯度', () => {
    const { mag } = sobel(new Float32Array(25).fill(100), 5, 5)
    for (const v of mag) expect(v).toBe(0)
  })

  it('垂直邊界產生梯度', () => {
    // 左半 0、右半 255，邊界在 x=2
    const gray = new Float32Array(25)
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) gray[y * 5 + x] = x < 2 ? 0 : 255
    const { mag } = sobel(gray, 5, 5)
    // 邊界那一欄的梯度最強，中央列取樣
    expect(mag[2 * 5 + 2]).toBeGreaterThan(0)
    // 遠離邊界的地方沒有梯度
    expect(mag[2 * 5 + 4 - 4]).toBe(mag[2 * 5 + 0])
  })

  it('邊框像素不計算，維持 0', () => {
    const gray = new Float32Array(25)
    for (let i = 0; i < 25; i++) gray[i] = i * 10
    const { mag } = sobel(gray, 5, 5)
    for (let x = 0; x < 5; x++) {
      expect(mag[x]).toBe(0)
      expect(mag[4 * 5 + x]).toBe(0)
    }
    for (let y = 0; y < 5; y++) {
      expect(mag[y * 5]).toBe(0)
      expect(mag[y * 5 + 4]).toBe(0)
    }
  })
})

describe('edgePoints', () => {
  it('取出的點數約等於指定的百分位', () => {
    const w = 40, h = 40
    const mag = new Float32Array(w * h)
    for (let i = 0; i < mag.length; i++) mag[i] = i % 97
    const { pts } = edgePoints(mag, w, h, 0.1)
    // 邊框不計，所以母數是內部像素
    expect(pts.length).toBeGreaterThan(0)
    expect(pts.length).toBeLessThan(w * h * 0.25)
  })

  it('全為 0 時取不到點', () => {
    const { pts } = edgePoints(new Float32Array(100), 10, 10, 0.1)
    expect(pts).toEqual([])
  })

  it('回傳的點帶著梯度強度', () => {
    const w = 10, h = 10
    const mag = new Float32Array(w * h)
    mag[5 * w + 5] = 1000
    const { pts } = edgePoints(mag, w, h, 0.5)
    expect(pts.some(p => p.x === 5 && p.y === 5 && p.m === 1000)).toBe(true)
  })
})
