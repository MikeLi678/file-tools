import { describe, expect, it } from 'vitest'
import { isUsable, type StoredSignature } from './store'

function make(overrides: Partial<StoredSignature> = {}): StoredSignature {
  return {
    id: 'a',
    blob: new Blob(['x']),
    width: 100,
    height: 50,
    createdAt: 1,
    ...overrides,
  }
}

describe('isUsable', () => {
  it('正常紀錄通過', () => {
    expect(isUsable(make())).toBe(true)
  })
  it('width 為 0 被擋掉', () => {
    expect(isUsable(make({ width: 0 }))).toBe(false)
  })
  it('height 為 0 被擋掉', () => {
    expect(isUsable(make({ height: 0 }))).toBe(false)
  })
  it('width 為負數被擋掉', () => {
    expect(isUsable(make({ width: -10 }))).toBe(false)
  })
  it('width 為 NaN 被擋掉', () => {
    expect(isUsable(make({ width: NaN }))).toBe(false)
  })
  it('width 為 Infinity 被擋掉', () => {
    expect(isUsable(make({ width: Infinity }))).toBe(false)
  })
  it('blob.size 為 0 被擋掉', () => {
    expect(isUsable(make({ blob: new Blob([]) }))).toBe(false)
  })

  // instanceof 的檢查是承重的：blob 若不是物件，後面的 .size 會丟 TypeError，
  // 讓整個 list() 爆掉而不是靜默跳過這一筆。
  it('blob 不是 Blob 時被擋掉且不會丟錯', () => {
    expect(isUsable(make({ blob: undefined as unknown as Blob }))).toBe(false)
    expect(isUsable(make({ blob: 'not a blob' as unknown as Blob }))).toBe(false)
  })
})
