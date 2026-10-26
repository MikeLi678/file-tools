import { describe, it, expect } from 'vitest'
import { fitToEdge } from './pageToImage'

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
})
