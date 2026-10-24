import { describe, it, expect } from 'vitest'
import { formatBytes, outputFileName } from './output'

describe('outputFileName', () => {
  it('用本地時間組成可排序的檔名', () => {
    expect(outputFileName(new Date(2026, 9, 23, 14, 5), 'pdf')).toBe('file-tools-20261023-1405.pdf')
  })

  it('月、日、時、分都補零', () => {
    expect(outputFileName(new Date(2026, 0, 2, 3, 4), 'jpg')).toBe('file-tools-20260102-0304.jpg')
  })
})

describe('formatBytes', () => {
  it('小於 1 KB 用 B', () => {
    expect(formatBytes(512)).toBe('512 B')
  })
  it('KB 保留一位小數', () => {
    expect(formatBytes(2048)).toBe('2.0 KB')
  })
  it('MB 保留一位小數', () => {
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
