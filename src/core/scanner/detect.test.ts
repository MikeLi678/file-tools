import { describe, expect, it } from 'vitest'
import { detectDocumentQuad, downscaleGray, edgePoints, houghLines, quadFromLines, sobel, validateQuad } from './detect'
import type { EdgePoint, HoughLine } from './detect'
import type { Quad } from './geometry'
import { LIMITS } from '../limits'
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

describe('houghLines', () => {
  it('一條水平線產生一個 theta 約 90 度的峰值', () => {
    // y = 20 上的一排點
    const pts = Array.from({ length: 60 }, (_, i) => ({ x: 10 + i, y: 20, m: 100 }))
    const lines = houghLines(pts, 100, 100)
    expect(lines.length).toBeGreaterThan(0)
    const top = lines[0]
    expect((top.theta * 180) / Math.PI).toBeCloseTo(90, 0)
    expect(top.rho).toBeCloseTo(20, 0)
  })

  it('一條垂直線產生一個 theta 約 0 度的峰值', () => {
    const pts = Array.from({ length: 60 }, (_, i) => ({ x: 30, y: 10 + i, m: 100 }))
    const lines = houghLines(pts, 100, 100)
    const top = lines[0]
    const deg = (top.theta * 180) / Math.PI
    expect(deg < 5 || deg > 175).toBe(true)
    expect(Math.abs(top.rho)).toBeCloseTo(30, 0)
  })

  it('同一條線不會留下兩個峰值（theta 環繞的 NMS）', () => {
    // 這條守的是陷阱一。theta 以 180 度為週期，(theta, rho) 與
    // (theta+180, -rho) 是同一條線；NMS 不處理環繞的話會留下兩個峰值。
    const pts = Array.from({ length: 80 }, (_, i) => ({ x: 40, y: 5 + i, m: 100 }))
    const lines = houghLines(pts, 100, 100)
    // 把所有近垂直的峰值統一方向後，不該有兩條描述同一位置的線
    const canon = lines
      .map(l => (l.theta > Math.PI / 2 ? { theta: l.theta - Math.PI, rho: -l.rho } : l))
      .filter(l => Math.abs((l.theta * 180) / Math.PI) < 10)
    const positions = canon.map(l => Math.round(l.rho))
    const unique = new Set(positions)
    expect(unique.size).toBe(positions.length)
  })

  it('近垂直線在環繞兩端都不會留下相鄰的重複峰值（容許 3px 內視為同一條）', () => {
    // 上一條測試用 Math.round 比對位置，會被 39 與 40 這種一格誤差騙過。
    // 這裡改成兩兩比較距離，並涵蓋 theta 在 0 附近兩側的傾斜。
    for (const deg of [0, 0.5, 1]) {
      const tan = Math.tan((deg * Math.PI) / 180)
      const pts = Array.from({ length: 80 }, (_, i) => ({ x: 40 + (5 + i) * tan, y: 5 + i, m: 100 }))
      const canon = houghLines(pts, 100, 100)
        .filter(l => l.score > 4000)
        .map(l => (l.theta > Math.PI / 2 ? { theta: l.theta - Math.PI, rho: -l.rho } : l))
      for (let i = 0; i < canon.length; i++) {
        for (let j = i + 1; j < canon.length; j++) {
          expect(Math.abs(canon[i].rho - canon[j].rho)).toBeGreaterThan(3)
        }
      }
    }
  })

  it('沒有邊緣點時回傳空陣列', () => {
    expect(houghLines([], 100, 100)).toEqual([])
  })

  it('最多回傳 detectMaxLines 條', () => {
    const pts: EdgePoint[] = []
    for (let i = 0; i < 300; i++) pts.push({ x: (i * 7) % 90 + 5, y: (i * 13) % 90 + 5, m: 50 + (i % 20) })
    expect(houghLines(pts, 100, 100).length).toBeLessThanOrEqual(LIMITS.detectMaxLines)
  })
})

describe('quadFromLines', () => {
  const line = (deg: number, rho: number, score: number): HoughLine => ({
    theta: (deg * Math.PI) / 180,
    rho,
    score,
  })

  it('四條邊界線交出正確的四角', () => {
    // 100x100 的畫面，文件在 (20,30)-(80,70)
    const lines = [
      line(0, 20, 1000),
      line(0, 80, 1000),
      line(90, 30, 900),
      line(90, 70, 900),
    ]
    const quad = quadFromLines(lines, 100, 100)
    expect(quad).not.toBeNull()
    const [tl, tr, br, bl] = quad!
    expect(tl.x).toBeCloseTo(20, 6)
    expect(tl.y).toBeCloseTo(30, 6)
    expect(tr.x).toBeCloseTo(80, 6)
    expect(br.y).toBeCloseTo(70, 6)
    expect(bl.x).toBeCloseTo(20, 6)
  })

  it('左右邊分別落在 theta 約 0 與約 180 時仍然正確（符號約定）', () => {
    // 這條守的是陷阱二。旋轉的文件左右兩邊會分別落在 theta≈0 與 theta≈180，
    // 法向量方向相反，不先統一方向的話「在中心哪一側」的符號會整個翻轉。
    const lines = [
      line(0, 20, 1000),
      // (178 度, -78) 與 (-2 度, 78) 是同一條線，描述右邊界
      line(178, -78, 1000),
      line(90, 30, 900),
      line(90, 70, 900),
    ]
    const quad = quadFromLines(lines, 100, 100)
    expect(quad).not.toBeNull()
    const xs = quad!.map(p => p.x)
    expect(Math.min(...xs)).toBeCloseTo(20, 0)
    expect(Math.max(...xs)).toBeGreaterThan(70)
  })

  it('按分數挑而不是取最外側', () => {
    // 多一條分數很低但更外側的雜訊線，不該被選中
    const lines = [
      line(0, 20, 1000),
      line(0, 80, 1000),
      line(0, 2, 10),
      line(90, 30, 900),
      line(90, 70, 900),
    ]
    const quad = quadFromLines(lines, 100, 100)
    expect(quad!.map(p => Math.round(p.x)).includes(2)).toBe(false)
  })

  it('兩條線都在中心同一側時回傳 null', () => {
    const lines = [
      line(0, 10, 1000),
      line(0, 20, 1000),
      line(90, 30, 900),
      line(90, 70, 900),
    ]
    expect(quadFromLines(lines, 100, 100)).toBeNull()
  })

  it('兩條線間距小於短邊 15% 時回傳 null', () => {
    const lines = [
      line(0, 48, 1000),
      line(0, 52, 1000),
      line(90, 30, 900),
      line(90, 70, 900),
    ]
    expect(quadFromLines(lines, 100, 100)).toBeNull()
  })

  it('某一族不足兩條時回傳 null', () => {
    expect(quadFromLines([line(0, 20, 1000), line(0, 80, 1000)], 100, 100)).toBeNull()
  })
})

describe('validateQuad', () => {
  const ok: Quad = [{ x: 20, y: 30 }, { x: 80, y: 30 }, { x: 80, y: 70 }, { x: 20, y: 70 }]

  it('正常的四邊形通過', () => {
    expect(validateQuad(ok, 100, 100).ok).toBe(true)
  })

  it('null 不通過', () => {
    expect(validateQuad(null, 100, 100).ok).toBe(false)
  })

  it('非有限座標不通過', () => {
    const bad: Quad = [{ x: NaN, y: 30 }, { x: 80, y: 30 }, { x: 80, y: 70 }, { x: 20, y: 70 }]
    expect(validateQuad(bad, 100, 100).ok).toBe(false)
  })

  it('明顯超出畫面不通過', () => {
    const bad: Quad = [{ x: -50, y: 30 }, { x: 80, y: 30 }, { x: 80, y: 70 }, { x: -50, y: 70 }]
    expect(validateQuad(bad, 100, 100).ok).toBe(false)
  })

  it('略微超出畫面（8% 以內）可以通過，因為透視時角點會略出框', () => {
    const slight: Quad = [{ x: -5, y: 25 }, { x: 103, y: 28 }, { x: 102, y: 75 }, { x: -3, y: 72 }]
    expect(validateQuad(slight, 100, 100).ok).toBe(true)
  })

  it('自交的四邊形不通過', () => {
    const bad: Quad = [{ x: 20, y: 30 }, { x: 80, y: 70 }, { x: 80, y: 30 }, { x: 20, y: 70 }]
    expect(validateQuad(bad, 100, 100).ok).toBe(false)
  })

  it('內角過於極端不通過', () => {
    // 這個 quad 的面積比是 0.225、凸、完全在畫面內，**只有內角（167 度）不合格**，
    // 所以它唯一的守門人就是角度規則。
    // 原本用的 [(10,50),(90,48),(95,52),(12,54)] 面積比只有 0.033，
    // 放寬角度門檻後會改由面積規則擋下，這條測試就守不住角度了。
    const skewed: Quad = [{ x: 5, y: 50 }, { x: 50, y: 45 }, { x: 95, y: 50 }, { x: 50, y: 95 }]
    const r = validateQuad(skewed, 100, 100)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.why).toContain('內角')
  })

  it('面積過小不通過', () => {
    const tiny: Quad = [{ x: 45, y: 45 }, { x: 55, y: 45 }, { x: 55, y: 55 }, { x: 45, y: 55 }]
    const r = validateQuad(tiny, 100, 100)
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.why).toContain('面積')
  })
})

describe('detectDocumentQuad', () => {
  it('影像太小時回傳 null，不跑偵測', () => {
    const img = makeImage(20, 20, () => 128)
    expect(detectDocumentQuad(img)).toBeNull()
  })

  it('純色影像沒有邊緣，回傳 null', () => {
    const img = makeImage(200, 200, () => 128)
    expect(detectDocumentQuad(img)).toBeNull()
  })

  it('合成的矩形文件能被偵測到', () => {
    // 深色背景上的亮矩形，(60,80)-(240,320) 於 300x400
    const img = makeImage(300, 400, (x, y) =>
      x >= 60 && x <= 240 && y >= 80 && y <= 320 ? 235 : 40,
    )
    const quad = detectDocumentQuad(img)
    expect(quad).not.toBeNull()
    const xs = quad!.map(p => p.x)
    const ys = quad!.map(p => p.y)
    const tol = 300 * 0.03
    expect(Math.min(...xs)).toBeCloseTo(60, -1)
    expect(Math.max(...xs)).toBeCloseTo(240, -1)
    expect(Math.min(...ys)).toBeCloseTo(80, -1)
    expect(Math.max(...ys)).toBeCloseTo(320, -1)
    expect(Math.abs(Math.min(...xs) - 60)).toBeLessThan(tol)
  })
})
