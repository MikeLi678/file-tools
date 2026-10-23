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

  it('單檔超過 50 MB 時只拒絕那一檔，其他照常接受', () => {
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
