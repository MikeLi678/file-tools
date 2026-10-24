import { describe, it, expect } from 'vitest'
import { applyFilter } from './filters'
import type { RasterImage } from '../../types'

function solid(width: number, height: number, rgb: [number, number, number]): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[0]
    data[i * 4 + 1] = rgb[1]
    data[i * 4 + 2] = rgb[2]
    data[i * 4 + 3] = 255
  }
  return { width, height, data }
}

/** 左半邊 dark、右半邊 light 的圖 */
function halves(width: number, height: number, dark: number, light: number): RasterImage {
  const img = solid(width, height, [0, 0, 0])
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = x < width / 2 ? dark : light
      const i = (y * width + x) * 4
      img.data[i] = v
      img.data[i + 1] = v
      img.data[i + 2] = v
    }
  }
  return img
}

/** 淺色背景上一塊深色方塊 */
function blobOnLight(size: number, blob: number, background: number, blobSize: number): RasterImage {
  const img = solid(size, size, [background, background, background])
  const start = Math.floor((size - blobSize) / 2)
  for (let y = start; y < start + blobSize; y++) {
    for (let x = start; x < start + blobSize; x++) {
      const i = (y * size + x) * 4
      img.data[i] = blob
      img.data[i + 1] = blob
      img.data[i + 2] = blob
    }
  }
  return img
}

const channelRange = (img: RasterImage, channel: number) => {
  let min = 255
  let max = 0
  for (let i = channel; i < img.data.length; i += 4) {
    min = Math.min(min, img.data[i])
    max = Math.max(max, img.data[i])
  }
  return { min, max }
}

describe('original', () => {
  it('像素不變但回傳新的陣列', () => {
    const img = halves(8, 8, 50, 200)
    const out = applyFilter(img, 'original')
    expect(Array.from(out.data)).toEqual(Array.from(img.data))
    expect(out.data).not.toBe(img.data)
  })
})

describe('enhance', () => {
  it('把原本 50 到 200 的範圍拉開到 0 到 255', () => {
    const out = applyFilter(halves(20, 20, 50, 200), 'enhance')
    expect(channelRange(out, 0)).toEqual({ min: 0, max: 255 })
  })

  it('單一純色圖不會被放大成雜訊', () => {
    const out = applyFilter(solid(10, 10, [120, 120, 120]), 'enhance')
    expect(channelRange(out, 0)).toEqual({ min: 120, max: 120 })
  })

  it('逐通道獨立拉伸，等於順手做了白平衡', () => {
    const img = solid(10, 10, [0, 0, 0])
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const i = (y * 10 + x) * 4
        const bright = x < 5
        img.data[i] = bright ? 30 : 90        // R 範圍 30-90
        img.data[i + 1] = bright ? 100 : 160  // G 範圍 100-160
        img.data[i + 2] = bright ? 10 : 250   // B 範圍 10-250
      }
    }
    const out = applyFilter(img, 'enhance')
    expect(channelRange(out, 0)).toEqual({ min: 0, max: 255 })
    expect(channelRange(out, 1)).toEqual({ min: 0, max: 255 })
    expect(channelRange(out, 2)).toEqual({ min: 0, max: 255 })
  })

  it('不動 alpha', () => {
    const out = applyFilter(halves(8, 8, 50, 200), 'enhance')
    for (let i = 3; i < out.data.length; i += 4) expect(out.data[i]).toBe(255)
  })
})

describe('mono', () => {
  it('深色區塊變全黑、淺色背景變全白', () => {
    const out = applyFilter(blobOnLight(40, 40, 230, 10), 'mono')
    const at = (x: number, y: number) => out.data[(y * 40 + x) * 4]
    expect(at(20, 20)).toBe(0)   // 方塊中心
    expect(at(2, 2)).toBe(255)   // 遠離方塊的背景
    expect(at(38, 38)).toBe(255)
  })

  it('輸出只有 0 與 255 兩種值', () => {
    const out = applyFilter(blobOnLight(40, 40, 230, 10), 'mono')
    const values = new Set<number>()
    for (let i = 0; i < out.data.length; i += 4) values.add(out.data[i])
    expect([...values].sort((a, b) => a - b)).toEqual([0, 255])
  })

  it('三個色彩通道一致', () => {
    const out = applyFilter(blobOnLight(40, 40, 230, 10), 'mono')
    for (let i = 0; i < out.data.length; i += 4) {
      expect(out.data[i + 1]).toBe(out.data[i])
      expect(out.data[i + 2]).toBe(out.data[i])
    }
  })

  it('整張均勻的淺色紙不會被切成一半黑', () => {
    const out = applyFilter(solid(40, 40, [235, 235, 235]), 'mono')
    for (let i = 0; i < out.data.length; i += 4) expect(out.data[i]).toBe(255)
  })

  it('一側偏暗的照片不會整片變黑（自適應二值化的存在理由）', () => {
    // 模擬斜照光：亮度從左側 90 線性漸變到右側 240，上面放兩個深色方塊當文字
    const size = 200
    const img = solid(size, size, [0, 0, 0])
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = Math.round(90 + (150 * x) / (size - 1))
        const i = (y * size + x) * 4
        img.data[i] = v
        img.data[i + 1] = v
        img.data[i + 2] = v
      }
    }
    // 暗側與亮側各放一個 20x20 的深色方塊
    const putBlock = (left: number, top: number) => {
      for (let y = top; y < top + 20; y++) {
        for (let x = left; x < left + 20; x++) {
          const i = (y * size + x) * 4
          img.data[i] = 30
          img.data[i + 1] = 30
          img.data[i + 2] = 30
        }
      }
    }
    putBlock(30, 90)
    putBlock(150, 90)

    const out = applyFilter(img, 'mono')
    const at = (x: number, y: number) => out.data[(y * size + x) * 4]

    // 暗側的背景必須是白的。全圖單一門檻會把這裡整片判成黑
    expect(at(20, 20)).toBe(255)
    expect(at(20, 180)).toBe(255)
    // 亮側的背景也是白的
    expect(at(180, 20)).toBe(255)
    // 兩側的方塊都要被判成黑
    expect(at(40, 100)).toBe(0)
    expect(at(160, 100)).toBe(0)
  })

  it('遠離原點的像素也判定正確（守住積分影像查詢公式的最後一項）', () => {
    // 測試點選在 x>15 且 y>15 的位置，讓 boxMean 的 integral[y0*stride+x0] 這一項
    // 不為零。影像要夠大，那一項的誤差才足以翻轉判定。
    const size = 100
    const img = solid(size, size, [200, 200, 200])
    for (let y = 60; y < 70; y++) {
      for (let x = 60; x < 70; x++) {
        const i = (y * size + x) * 4
        img.data[i] = 20
        img.data[i + 1] = 20
        img.data[i + 2] = 20
      }
    }

    const out = applyFilter(img, 'mono')
    const at = (x: number, y: number) => out.data[(y * size + x) * 4]

    expect(at(65, 65)).toBe(0)
    expect(at(10, 10)).toBe(255)
  })
})
