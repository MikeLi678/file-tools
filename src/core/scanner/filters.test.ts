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
})
