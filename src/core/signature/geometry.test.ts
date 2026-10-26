import { describe, expect, it } from 'vitest'
import {
  clampOverlayBox,
  inkBounds,
  overlayHeight,
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

  it('r=180 的非對稱點', () => {
    expect(toDisplaySpace({ x: 0.25, y: 0.75 }, 180)).toEqual({ x: 0.75, y: 0.25 })
  })

  it('r=270 把右上送到左上', () => {
    expect(toDisplaySpace({ x: 1, y: 0 }, 270)).toEqual({ x: 0, y: 0 })
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

  it('r=90 的一般點', () => {
    expect(toUnrotatedSpace({ x: 0.25, y: 0.25 }, 90)).toEqual({ x: 0.25, y: 0.75 })
  })

  it('r=180 的非對稱點', () => {
    expect(toUnrotatedSpace({ x: 0.75, y: 0.25 }, 180)).toEqual({ x: 0.25, y: 0.75 })
  })

  it('r=270 的一般點', () => {
    expect(toUnrotatedSpace({ x: 0.75, y: 0.75 }, 270)).toEqual({ x: 0.25, y: 0.75 })
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
    const shifted = { x: 20, y: 30, width: 600, height: 800 }
    const rect = normalizedToPdfRect({ x: 0.1, y: 0.8, width: 0.3 }, shifted, 1 / 3)
    expect(rect.x).toBeCloseTo(80, 10)
    // y = 30 + 800 - 0.8*800 - 60 = 130（x 與 y 偏移刻意不同）
    expect(rect.y).toBeCloseTo(130, 10)
    expect(rect.width).toBeCloseTo(180, 10)
    expect(rect.height).toBeCloseTo(60, 10)
  })

  it('影像頁用 fitOnA4 的 placement 當盒子，簽名落在影像區域內', () => {
    // 一張 1000x500 的影像放在橫向 A4 上的 placement
    const placement = { x: 0, y: 130.945, width: 841.89, height: 420.945 }
    const rect = normalizedToPdfRect({ x: 0.5, y: 0.5, width: 0.2 }, placement, 0.5)
    // width = 0.2*841.89 = 168.378；height = 84.189
    // x = 0 + 0.5*841.89 = 420.945
    // y = 130.945 + 420.945 - 0.5*420.945 - 84.189 = 257.2285（y 軸翻轉寫錯會對不上）
    expect(rect.x).toBeCloseTo(420.945, 6)
    expect(rect.y).toBeCloseTo(257.2285, 6)
    expect(rect.width).toBeCloseTo(168.378, 6)
    expect(rect.height).toBeCloseTo(84.189, 6)
    expect(rect.x).toBeGreaterThanOrEqual(placement.x)
    expect(rect.y).toBeGreaterThanOrEqual(placement.y)
    expect(rect.x + rect.width).toBeLessThanOrEqual(placement.x + placement.width)
    expect(rect.y + rect.height).toBeLessThanOrEqual(placement.y + placement.height)
  })
})

describe('overlayHeight', () => {
  it('正方形頁時等於 width 乘上簽名長寬比', () => {
    expect(overlayHeight(0.4, 0.5, 1)).toBeCloseTo(0.2, 10)
  })

  it('A4 直向：頁面比簽名高，正規化高度變小', () => {
    // pageAspect = 841.89 / 595.28 = 1.41428...
    expect(overlayHeight(0.4, 0.5, 841.89 / 595.28)).toBeCloseTo(0.14142, 5)
  })

  it('A4 橫向：頁面比簽名寬，正規化高度變大', () => {
    expect(overlayHeight(0.4, 0.5, 595.28 / 841.89)).toBeCloseTo(0.282855, 6)
  })
})

describe('clampOverlayBox', () => {
  // 以下除特別註明外，語意都是正方形頁（pageAspect = 1）
  it('完全在頁面內時不動', () => {
    expect(clampOverlayBox({ x: 0.2, y: 0.2, width: 0.3 }, 0.5, 1)).toEqual({
      x: 0.2,
      y: 0.2,
      width: 0.3,
    })
  })

  it('右側超出時推回來，其他欄位不變', () => {
    const box = clampOverlayBox({ x: 0.9, y: 0.2, width: 0.3 }, 0.5, 1)
    expect(box.x).toBeCloseTo(0.7, 10)
    expect(box.y).toBe(0.2)
    expect(box.width).toBe(0.3)
  })

  it('下方超出時推回來，其他欄位不變', () => {
    // 寬 0.4、長寬比 0.5 → 正規化高度 0.2
    const box = clampOverlayBox({ x: 0.2, y: 0.95, width: 0.4 }, 0.5, 1)
    expect(box.y).toBeCloseTo(0.8, 10)
    expect(box.x).toBe(0.2)
    expect(box.width).toBe(0.4)
  })

  it('負座標拉回 0', () => {
    const box = clampOverlayBox({ x: -0.3, y: -0.1, width: 0.3 }, 0.5, 1)
    expect(box.x).toBe(0)
    expect(box.y).toBe(0)
  })

  it('width = 1 時 x 被夾到 0', () => {
    const box = clampOverlayBox({ x: 0.5, y: 0.2, width: 1 }, 0.5, 1)
    expect(box.x).toBe(0)
    expect(box.width).toBe(1)
    expect(box.y).toBe(0.2)
  })

  it('寬度夾限在 0.05 到 1 之間', () => {
    expect(clampOverlayBox({ x: 0, y: 0, width: 0.01 }, 0.5, 1).width).toBeCloseTo(0.05, 10)
    expect(clampOverlayBox({ x: 0, y: 0, width: 2 }, 0.5, 1).width).toBe(1)
  })

  it('長寬比使高度超過整頁時，寬度要跟著縮', () => {
    // 長寬比 4 的細長簽名：寬 0.5 會讓高度變成 2.0，放不下
    const box = clampOverlayBox({ x: 0, y: 0, width: 0.5 }, 4, 1)
    expect(box.width * 4).toBeLessThanOrEqual(1 + 1e-9)
  })

  // 下面兩條的期望值刻意寫成硬編碼的數字，不經過 overlayHeight 計算。
  // 用 overlayHeight 算期望值的話，實作漏掉 / pageAspect 時斷言會跟著一起錯，
  // 結果自洽而測試照樣通過——那種測試擋不住任何東西。
  // 漏掉 / pageAspect 時這兩條算出的 y 都會變成 0.8，與下面的數字不同，所以會變紅。
  it('在 A4 橫向不會讓簽名溢出頁底', () => {
    const box = clampOverlayBox({ x: 0.2, y: 0.95, width: 0.4 }, 0.5, 595.28 / 841.89)
    expect(box.width).toBeCloseTo(0.4, 10)
    expect(box.y).toBeCloseTo(0.7171448730009407, 12)
  })

  it('在 A4 直向可以貼到頁底，不留空隙', () => {
    const box = clampOverlayBox({ x: 0.2, y: 0.99, width: 0.4 }, 0.5, 841.89 / 595.28)
    expect(box.width).toBeCloseTo(0.4, 10)
    expect(box.y).toBeCloseTo(0.8585848507524736, 12)
  })

  it('高度保護會讓寬度低於下限（放得進頁面優先）', () => {
    // 長寬比 40 的極細長簽名：要放進方形頁，寬度只能是 1/40 = 0.025，低於下限 0.05
    const box = clampOverlayBox({ x: 0, y: 0, width: 0.5 }, 40, 1)
    expect(box.width).toBeCloseTo(0.025, 10)
    expect(overlayHeight(box.width, 40, 1)).toBeCloseTo(1, 10)
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

  it('點遞減排列時仍取真正的最小與最大', () => {
    const bounds = inkBounds([[{ x: 30, y: 50 }, { x: 10, y: 20 }]], 4)
    expect(bounds).toEqual({ minX: 8, minY: 18, maxX: 32, maxY: 52 })
  })

  it('點亂序時極值不在頭尾', () => {
    const bounds = inkBounds([[{ x: 20, y: 35 }, { x: 10, y: 50 }, { x: 30, y: 20 }, { x: 15, y: 40 }]], 4)
    expect(bounds).toEqual({ minX: 8, minY: 18, maxX: 32, maxY: 52 })
  })

  it('含負座標', () => {
    const bounds = inkBounds([[{ x: -10, y: -20 }, { x: 5, y: 3 }]], 2)
    expect(bounds).toEqual({ minX: -11, minY: -21, maxX: 6, maxY: 4 })
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
