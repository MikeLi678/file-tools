import { describe, expect, it } from 'vitest'
import { captureSize } from './capture'
import { LIMITS } from '../limits'

describe('captureSize', () => {
  it('長邊縮到上限，長寬比不變', () => {
    const size = captureSize({ minX: 0, minY: 0, maxX: 2400, maxY: 800 })
    expect(size.width).toBe(LIMITS.signatureCaptureEdge)
    expect(size.height).toBe(LIMITS.signatureCaptureEdge / 3)
    expect(size.scale).toBeCloseTo(0.5, 10)
  })

  it('比上限小的筆跡不放大', () => {
    const size = captureSize({ minX: 0, minY: 0, maxX: 300, maxY: 100 })
    expect(size.width).toBe(300)
    expect(size.height).toBe(100)
    expect(size.scale).toBe(1)
  })

  it('高比寬長時以高度為準', () => {
    const size = captureSize({ minX: 0, minY: 0, maxX: 600, maxY: 2400 })
    expect(size.height).toBe(LIMITS.signatureCaptureEdge)
    expect(size.width).toBe(LIMITS.signatureCaptureEdge / 4)
  })

  it('寬高至少是 1 像素', () => {
    const size = captureSize({ minX: 10, minY: 10, maxX: 10.2, maxY: 10.2 })
    expect(size.width).toBeGreaterThanOrEqual(1)
    expect(size.height).toBeGreaterThanOrEqual(1)
  })

  it('外接矩形的原點不在 0 時尺寸只看範圍大小', () => {
    const size = captureSize({ minX: 500, minY: 300, maxX: 800, maxY: 400 })
    expect(size.width).toBe(300)
    expect(size.height).toBe(100)
  })
})
