import { describe, it, expect } from 'vitest'
import { LIMITS, checkLimits } from './limits'

const file = (fileName: string, bytes: number, pageCount: number) => ({ fileName, bytes, pageCount })

describe('checkLimits', () => {
  it('全部在上限內時整批接受', () => {
    const result = checkLimits({
      currentPageCount: 0,
      currentTotalBytes: 0,
      incoming: [file('a.pdf', 1000, 3), file('b.pdf', 2000, 4)],
    })
    expect(result.accepted.map(f => f.fileName)).toEqual(['a.pdf', 'b.pdf'])
    expect(result.rejected).toEqual([])
  })

  it('單檔超過單檔上限 時只拒絕那一檔，其他照常接受', () => {
    const result = checkLimits({
      currentPageCount: 0,
      currentTotalBytes: 0,
      incoming: [file('big.pdf', LIMITS.maxFileBytes + 1, 1), file('ok.pdf', 100, 1)],
    })
    expect(result.accepted.map(f => f.fileName)).toEqual(['ok.pdf'])
    expect(result.rejected).toEqual([{ fileName: 'big.pdf', reason: 'file-too-large' }])
  })

  it('加上既有頁數後超過 100 頁時拒絕該檔，理由是 limit-pages', () => {
    const result = checkLimits({
      currentPageCount: 98,
      currentTotalBytes: 0,
      incoming: [file('three.pdf', 100, 3), file('two.pdf', 100, 2)],
    })
    expect(result.accepted.map(f => f.fileName)).toEqual(['two.pdf'])
    expect(result.rejected).toEqual([{ fileName: 'three.pdf', reason: 'limit-pages' }])
  })

  it('累積位元組超過總上限時理由是 limit-total-bytes', () => {
    const result = checkLimits({
      currentPageCount: 0,
      currentTotalBytes: LIMITS.maxTotalBytes - 500,
      incoming: [file('x.pdf', 1000, 1)],
    })
    expect(result.accepted).toEqual([])
    expect(result.rejected).toEqual([{ fileName: 'x.pdf', reason: 'limit-total-bytes' }])
  })

  it('不會靜默截斷：拒絕的檔案一定出現在 rejected 裡', () => {
    const result = checkLimits({
      currentPageCount: 0,
      currentTotalBytes: 0,
      incoming: [file('a.pdf', 100, 100), file('b.pdf', 100, 1), file('c.pdf', 100, 1)],
    })
    expect(result.accepted.map(f => f.fileName)).toEqual(['a.pdf'])
    expect(result.rejected.map(f => f.fileName)).toEqual(['b.pdf', 'c.pdf'])
  })

  it('單檔大小恰好等於上限時應該接受，不是拒絕', () => {
    const result = checkLimits({
      currentPageCount: 0,
      currentTotalBytes: 0,
      incoming: [file('exact.pdf', LIMITS.maxFileBytes, 1)],
    })
    expect(result.accepted.map(f => f.fileName)).toEqual(['exact.pdf'])
    expect(result.rejected).toEqual([])
  })

  it('同時踩到頁數與總位元組上限時，先回報頁數超限', () => {
    const result = checkLimits({
      currentPageCount: 99,
      currentTotalBytes: LIMITS.maxTotalBytes - 10,
      incoming: [file('both.pdf', 100, 5)],
    })
    expect(result.accepted).toEqual([])
    expect(result.rejected).toEqual([{ fileName: 'both.pdf', reason: 'limit-pages' }])
  })
})

describe('v1.1 的轉圖片上限', () => {
  it('轉圖片的長邊是 2000px', () => {
    expect(LIMITS.imageExportEdge).toBe(2000)
  })

  it('一次最多轉 20 頁', () => {
    expect(LIMITS.maxImageExportPages).toBe(20)
  })

  it('轉圖片的長邊小於相機影格的上限', () => {
    // 2000px 對 A4 約 170dpi，對分享用的圖片足夠；
    // 比 maxCaptureEdge 小是因為轉圖片會一次處理多頁，記憶體壓力更大
    expect(LIMITS.imageExportEdge).toBeLessThan(LIMITS.maxCaptureEdge)
  })
})

it('簽名相關的上限都是正數且合理', () => {
  expect(LIMITS.maxStoredSignatures).toBeGreaterThan(0)
  expect(LIMITS.maxOverlaysPerPage).toBeGreaterThan(0)
  expect(LIMITS.signatureCaptureEdge).toBeGreaterThan(0)
  expect(LIMITS.maxSignatureBytes).toBeGreaterThan(0)
})

it('簽名擷取的長邊小於掃描影格的上限', () => {
  // 簽名是線條不是照片，不需要跟掃描件一樣的解析度
  expect(LIMITS.signatureCaptureEdge).toBeLessThan(LIMITS.maxCaptureEdge)
})

it('偵測相關的上限都合理', () => {
  expect(LIMITS.detectWorkEdge).toBeGreaterThan(0)
  expect(LIMITS.detectEdgePercentile).toBeGreaterThan(0)
  expect(LIMITS.detectEdgePercentile).toBeLessThan(1)
  expect(LIMITS.detectBlurRadius).toBeGreaterThanOrEqual(1)
  expect(LIMITS.detectThetaSteps).toBeGreaterThanOrEqual(90)
  expect(LIMITS.detectMaxLines).toBeGreaterThanOrEqual(8)
  expect(LIMITS.magnifierScale).toBeGreaterThan(1)
})

it('偵測的工作解析度遠小於擷取影格的上限', () => {
  // 2400px 的原尺寸跑 Sobel 與 Hough 太慢，降到 320px 實測 12-31ms
  expect(LIMITS.detectWorkEdge).toBeLessThan(LIMITS.maxCaptureEdge / 4)
})
