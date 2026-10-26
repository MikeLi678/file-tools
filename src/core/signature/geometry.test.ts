import { describe, expect, it } from 'vitest'
import {
  clampOverlayBox,
  inkBounds,
  normalizedToPdfRect,
  toDisplaySpace,
  toUnrotatedSpace,
} from './geometry'

describe('toDisplaySpace', () => {
  // 順時針旋轉：未旋轉的左上角會被送到哪裡
  it('r=0 原樣不動', () => {
    expect(toDisplaySpace({ x: 0.25, y: 0.75 }, 0)).toEqual({ x: 0.25, y: 0.75 })
  })

  it('r=90 把左上送到右上', () => {
    expect(toDisplaySpace({ x: 0, y: 0 }, 90)).toEqual({ x: 1, y: 0 })
  })

  it('r=90 把右上送到右下', () => {
    expect(toDisplaySpace({ x: 1, y: 0 }, 90)).toEqual({ x: 1, y: 1 })
  })

  it('r=180 把左上送到右下', () => {
    expect(toDisplaySpace({ x: 0, y: 0 }, 180)).toEqual({ x: 1, y: 1 })
  })

  it('r=270 把左上送到左下', () => {
    expect(toDisplaySpace({ x: 0, y: 0 }, 270)).toEqual({ x: 0, y: 1 })
  })

  it('r=90 的一般點', () => {
    expect(toDisplaySpace({ x: 0.25, y: 0.75 }, 90)).toEqual({ x: 0.25, y: 0.25 })
  })

  it('r=270 的一般點', () => {
    expect(toDisplaySpace({ x: 0.25, y: 0.75 }, 270)).toEqual({ x: 0.75, y: 0.75 })
  })
})

describe('toUnrotatedSpace', () => {
  it('r=90 把右上還原成左上', () => {
    expect(toUnrotatedSpace({ x: 1, y: 0 }, 90)).toEqual({ x: 0, y: 0 })
  })

  it('r=270 把左下還原成左上', () => {
    expect(toUnrotatedSpace({ x: 0, y: 1 }, 270)).toEqual({ x: 0, y: 0 })
  })

  it('四種旋轉都能往返', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 0.25, y: 0.75 },
      { x: 0.5, y: 0.5 },
    ]
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const point of points) {
        const back = toUnrotatedSpace(toDisplaySpace(point, rotation), rotation)
        expect(back.x).toBeCloseTo(point.x, 12)
        expect(back.y).toBeCloseTo(point.y, 12)
      }
    }
  })
})

describe('normalizedToPdfRect', () => {
  const box = { x: 0, y: 0, width: 600, height: 800 }

  it('左上角的覆蓋層落在頁面頂端', () => {
    // 寬 0.5 → 300pt；長寬比 1/3 → 高 100pt；y 由上往下 0 → 頂端減高度
    expect(normalizedToPdfRect({ x: 0, y: 0, width: 0.5 }, box, 1 / 3)).toEqual({
      x: 0,
      y: 700,
      width: 300,
      height: 100,
    })
  })

  it('v=0.8 時從頂端往下量', () => {
    const rect = normalizedToPdfRect({ x: 0.1, y: 0.8, width: 0.3 }, box, 1 / 3)
    expect(rect.width).toBeCloseTo(180, 10)
    expect(rect.height).toBeCloseTo(60, 10)
    expect(rect.x).toBeCloseTo(60, 10)
    // 頂端 = 800 - 0.8*800 = 160，再減去高度 60
    expect(rect.y).toBeCloseTo(100, 10)
  })

  it('MediaBox 原點不在 (0,0) 時要加上偏移', () => {
    const shifted = { x: 20, y: 20, width: 600, height: 800 }
    const rect = normalizedToPdfRect({ x: 0.1, y: 0.8, width: 0.3 }, shifted, 1 / 3)
    expect(rect.x).toBeCloseTo(80, 10)
    expect(rect.y).toBeCloseTo(120, 10)
  })

  it('影像頁用 fitOnA4 的 placement 當盒子，簽名落在影像區域內', () => {
    // 一張 1000x500 的影像放在橫向 A4 上的 placement
    const placement = { x: 0, y: 130.945, width: 841.89, height: 420.945 }
    const rect = normalizedToPdfRect({ x: 0.5, y: 0.5, width: 0.2 }, placement, 0.5)
    expect(rect.x).toBeGreaterThanOrEqual(placement.x)
    expect(rect.y).toBeGreaterThanOrEqual(placement.y)
    expect(rect.x + rect.width).toBeLessThanOrEqual(placement.x + placement.width)
    expect(rect.y + rect.height).toBeLessThanOrEqual(placement.y + placement.height)
  })
})

describe('clampOverlayBox', () => {
  it('完全在頁面內時不動', () => {
    expect(clampOverlayBox({ x: 0.2, y: 0.2, width: 0.3 }, 0.5)).toEqual({
      x: 0.2,
      y: 0.2,
      width: 0.3,
    })
  })

  it('右側超出時推回來', () => {
    expect(clampOverlayBox({ x: 0.9, y: 0.2, width: 0.3 }, 0.5).x).toBeCloseTo(0.7, 10)
  })

  it('下方超出時推回來', () => {
    // 寬 0.4、長寬比 0.5 → 正規化高度 0.2
    expect(clampOverlayBox({ x: 0.2, y: 0.95, width: 0.4 }, 0.5).y).toBeCloseTo(0.8, 10)
  })

  it('負座標拉回 0', () => {
    const box = clampOverlayBox({ x: -0.3, y: -0.1, width: 0.3 }, 0.5)
    expect(box.x).toBe(0)
    expect(box.y).toBe(0)
  })

  it('寬度夾限在 0.05 到 1 之間', () => {
    expect(clampOverlayBox({ x: 0, y: 0, width: 0.01 }, 0.5).width).toBeCloseTo(0.05, 10)
    expect(clampOverlayBox({ x: 0, y: 0, width: 2 }, 0.5).width).toBe(1)
  })

  it('長寬比使高度超過整頁時，寬度要跟著縮', () => {
    // 長寬比 4 的細長簽名：寬 0.5 會讓高度變成 2.0，放不下
    const box = clampOverlayBox({ x: 0, y: 0, width: 0.5 }, 4)
    expect(box.width * 4).toBeLessThanOrEqual(1 + 1e-9)
  })
})

describe('inkBounds', () => {
  it('單點也有外接矩形，大小等於筆畫寬度', () => {
    const bounds = inkBounds([[{ x: 50, y: 60 }]], 10)
    expect(bounds).toEqual({ minX: 45, minY: 55, maxX: 55, maxY: 65 })
  })

  it('單筆折線含筆畫寬度', () => {
    const bounds = inkBounds([[{ x: 10, y: 20 }, { x: 30, y: 50 }]], 4)
    expect(bounds).toEqual({ minX: 8, minY: 18, maxX: 32, maxY: 52 })
  })

  it('多筆取聯集', () => {
    const bounds = inkBounds(
      [
        [{ x: 10, y: 10 }],
        [{ x: 100, y: 200 }],
      ],
      2,
    )
    expect(bounds).toEqual({ minX: 9, minY: 9, maxX: 101, maxY: 201 })
  })

  it('沒有筆畫回傳 null', () => {
    expect(inkBounds([], 4)).toBeNull()
    expect(inkBounds([[]], 4)).toBeNull()
  })
})
