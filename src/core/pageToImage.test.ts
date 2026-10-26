import { describe, it, expect } from 'vitest'
import { fitToEdge, pagesToJpegBlobs } from './pageToImage'
import type { Page } from '../types'

describe('fitToEdge', () => {
  it('橫向影像以寬為長邊', () => {
    expect(fitToEdge(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 })
  })

  it('直向影像以高為長邊', () => {
    expect(fitToEdge(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 })
  })

  it('正方形兩邊都等於長邊', () => {
    expect(fitToEdge(1000, 1000, 2000)).toEqual({ width: 2000, height: 2000 })
  })

  it('小於長邊時放大到長邊', () => {
    // 來源頁通常是 595x842 pt，一定要放大才會有足夠解析度
    expect(fitToEdge(595, 842, 2000)).toEqual({ width: 1413, height: 2000 })
  })

  it('四捨五入成整數像素', () => {
    const size = fitToEdge(1001, 333, 2000)
    expect(Number.isInteger(size.width)).toBe(true)
    expect(Number.isInteger(size.height)).toBe(true)
  })

  it('至少 1 像素，不會回傳 0', () => {
    expect(fitToEdge(10000, 1, 100)).toEqual({ width: 100, height: 1 })
  })

  it('極端直向時 width 也不會變成 0', () => {
    // 既有的極端案例只壓到 height，width 的下限保護沒有被測到
    expect(fitToEdge(1, 10000, 100)).toEqual({ width: 1, height: 100 })
  })

  it('是四捨五入而不是無條件捨去', () => {
    // 610/842 放大到長邊 2000 時，寬是 1448.9——round 得 1449、floor 得 1448。
    // 只斷言 Number.isInteger 的話這兩者分不出來
    expect(fitToEdge(610, 842, 2000)).toEqual({ width: 1449, height: 2000 })
  })
})

describe('pagesToJpegBlobs 的錯誤路徑', () => {
  it('頁面清單為空時丟出明確錯誤', async () => {
    await expect(pagesToJpegBlobs({ pages: [], loadedFiles: {}, signatures: {} })).rejects.toThrow('沒有可轉換的頁面')
  })

  it('引用了不存在的來源檔案時丟出明確錯誤', async () => {
    const page: Page = {
      id: 'p1',
      source: { kind: 'pdf', fileId: 'missing', pageIndex: 0 },
      rotation: 0,
      selected: false,
      overlays: [],
    }
    await expect(pagesToJpegBlobs({ pages: [page], loadedFiles: {}, signatures: {} })).rejects.toThrow('找不到來源檔案')
  })
})
