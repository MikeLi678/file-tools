import { describe, it, expect } from 'vitest'
import { applyHomography, estimateOutputSize, isConvexQuad, quadAngles, quadArea, solveHomography, warpPerspective } from './geometry'
import type { Quad } from './geometry'
import type { RasterImage } from '../../types'

/** 建一張每個像素都不同的小圖，方便驗證取樣位置正確 */
function gradient(width: number, height: number): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      data[i] = x * 10
      data[i + 1] = y * 10
      data[i + 2] = 0
      data[i + 3] = 255
    }
  }
  return { width, height, data }
}

const fullQuad = (w: number, h: number): Quad => [
  { x: 0, y: 0 },
  { x: w - 1, y: 0 },
  { x: w - 1, y: h - 1 },
  { x: 0, y: h - 1 },
]

describe('estimateOutputSize', () => {
  it('取上下兩邊的較長者當寬、左右兩邊的較長者當高', () => {
    const quad: Quad = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 120, y: 200 },
      { x: 0, y: 200 },
    ]
    // 右邊 (100,0)-(120,200) 長 200.998，四捨五入後是 201
    expect(estimateOutputSize(quad)).toEqual({ width: 120, height: 201 })
  })

  it('退化成一點時仍回傳至少 1x1', () => {
    const quad: Quad = [{ x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }]
    expect(estimateOutputSize(quad)).toEqual({ width: 1, height: 1 })
  })
})

describe('solveHomography', () => {
  it('src 與 dst 相同時得到單位矩陣', () => {
    const q = fullQuad(10, 10)
    const h = solveHomography(q, q)
    expect(h[0]).toBeCloseTo(1, 6)
    expect(h[4]).toBeCloseTo(1, 6)
    expect(h[8]).toBeCloseTo(1, 6)
    expect(h[1]).toBeCloseTo(0, 6)
    expect(h[6]).toBeCloseTo(0, 6)
  })

  it('把梯形映到矩形後，四個角互相對得上', () => {
    const src: Quad = [
      { x: 80, y: 40 },
      { x: 330, y: 70 },
      { x: 300, y: 260 },
      { x: 50, y: 230 },
    ]
    const dst = fullQuad(250, 200)
    const h = solveHomography(src, dst)
    for (let i = 0; i < 4; i++) {
      const mapped = applyHomography(h, src[i])
      expect(mapped.x).toBeCloseTo(dst[i].x, 4)
      expect(mapped.y).toBeCloseTo(dst[i].y, 4)
    }
  })

  it('四角退化到無法求解時丟出明確錯誤', () => {
    const degenerate: Quad = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]
    expect(() => solveHomography(degenerate, fullQuad(10, 10))).toThrow('無法求解透視矩陣')
  })
})

describe('warpPerspective', () => {
  it('裁切框就是整張圖、輸出尺寸相同時，像素完全不變', () => {
    const src = gradient(8, 6)
    const out = warpPerspective(src, fullQuad(8, 6), 8, 6)
    expect(out.width).toBe(8)
    expect(out.height).toBe(6)
    expect(Array.from(out.data)).toEqual(Array.from(src.data))
  })

  it('輸出四角的像素對應到來源四角的像素', () => {
    const src = gradient(20, 20)
    const quad: Quad = [
      { x: 2, y: 3 },
      { x: 17, y: 2 },
      { x: 16, y: 18 },
      { x: 3, y: 17 },
    ]
    const out = warpPerspective(src, quad, 10, 10)
    const at = (img: RasterImage, x: number, y: number) => {
      const i = (y * img.width + x) * 4
      return [img.data[i], img.data[i + 1]]
    }
    // 左上角應取自 (2,3)，也就是 R=20、G=30
    expect(at(out, 0, 0)).toEqual([20, 30])
    // 右下角應取自 (16,18)，也就是 R=160、G=180
    expect(at(out, 9, 9)).toEqual([160, 180])
  })

  it('取樣超出來源邊界時夾到邊緣，不產生透明黑邊', () => {
    const src = gradient(10, 10)
    const quad: Quad = [
      { x: -5, y: -5 },
      { x: 14, y: -5 },
      { x: 14, y: 14 },
      { x: -5, y: 14 },
    ]
    const out = warpPerspective(src, quad, 6, 6)
    for (let i = 3; i < out.data.length; i += 4) {
      expect(out.data[i]).toBe(255)
    }
  })
})

describe('quadArea', () => {
  it('單位正方形的面積是 1', () => {
    expect(quadArea([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBeCloseTo(1, 10)
  })

  it('矩形', () => {
    expect(quadArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }])).toBeCloseTo(12, 10)
  })

  it('梯形', () => {
    // 上底 2、下底 4、高 3 → (2+4)*3/2 = 9
    expect(quadArea([{ x: 1, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }])).toBeCloseTo(9, 10)
  })

  it('點序反向時面積仍為正', () => {
    expect(quadArea([{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 }])).toBeCloseTo(1, 10)
  })
})

describe('isConvexQuad', () => {
  it('正方形是凸的', () => {
    expect(isConvexQuad([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBe(true)
  })

  it('梯形是凸的', () => {
    expect(isConvexQuad([{ x: 1, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }])).toBe(true)
  })

  it('自交的「蝴蝶形」不是凸的', () => {
    expect(isConvexQuad([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 1 }])).toBe(false)
  })

  it('凹四邊形不是凸的', () => {
    expect(isConvexQuad([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }])).toBe(false)
  })

  it('三點共線視為不是凸的', () => {
    expect(isConvexQuad([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }])).toBe(false)
  })
})

describe('quadAngles', () => {
  it('正方形的四個內角都是 90 度', () => {
    const angles = quadAngles([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])
    expect(angles).toHaveLength(4)
    for (const a of angles) expect(a).toBeCloseTo(90, 6)
  })

  it('內角和是 360 度', () => {
    const angles = quadAngles([{ x: 1, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }])
    expect(angles.reduce((a, b) => a + b)).toBeCloseTo(360, 6)
  })

  it('很扁的四邊形會有極端內角', () => {
    const angles = quadAngles([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0.5 }, { x: 0, y: 0.5 }])
    // 仍是矩形所以都是 90 度，但換成歪斜的就會出現小角
    const skewed = quadAngles([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 12, y: 1 }, { x: 0, y: 1 }])
    expect(Math.min(...angles)).toBeCloseTo(90, 6)
    expect(Math.min(...skewed)).toBeLessThan(70)
  })
})
