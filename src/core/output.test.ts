import { describe, it, expect } from 'vitest'
import { formatBytes, outputFileName, sanitizeFileName } from './output'

describe('outputFileName', () => {
  it('用本地時間組成可排序的檔名', () => {
    expect(outputFileName(new Date(2026, 9, 23, 14, 5), 'pdf')).toBe('file-tools-20261023-1405.pdf')
  })

  it('月、日、時、分都補零', () => {
    expect(outputFileName(new Date(2026, 0, 2, 3, 4), 'jpg')).toBe('file-tools-20260102-0304.jpg')
  })

  it('帶序號時加在副檔名之前', () => {
    expect(outputFileName(new Date(2026, 9, 26, 11, 30), 'jpg', 1)).toBe('file-tools-20261026-1130-1.jpg')
  })

  it('不帶序號時維持原樣', () => {
    expect(outputFileName(new Date(2026, 9, 26, 11, 30), 'jpg')).toBe('file-tools-20261026-1130.jpg')
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

describe('sanitizeFileName', () => {
  it('一般名稱原樣保留', () => {
    expect(sanitizeFileName('報告', 'fallback')).toBe('報告')
  })

  it('過濾檔案系統的非法字元', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j', 'fallback')).toBe('abcdefghij')
  })

  it('過濾控制字元', () => {
    expect(sanitizeFileName('a\u0000b\u001fc', 'fallback')).toBe('abc')
  })

  it('去掉前後空白', () => {
    expect(sanitizeFileName('  報告  ', 'fallback')).toBe('報告')
  })

  it('留空時退回預設', () => {
    expect(sanitizeFileName('', 'fallback')).toBe('fallback')
  })

  it('全是非法字元時退回預設', () => {
    expect(sanitizeFileName('///', 'fallback')).toBe('fallback')
  })

  it('只有空白時退回預設', () => {
    expect(sanitizeFileName('   ', 'fallback')).toBe('fallback')
  })

  it('超過 80 字時截斷', () => {
    const long = 'あ'.repeat(200)
    expect(sanitizeFileName(long, 'fallback')).toHaveLength(80)
  })

  it('開頭的點號會被清掉，不產生隱藏檔', () => {
    expect(sanitizeFileName('.報告', 'fallback')).toBe('報告')
    expect(sanitizeFileName('...報告', 'fallback')).toBe('報告')
  })

  it('結尾的點號會被清掉（Windows 會把它吃掉）', () => {
    expect(sanitizeFileName('報告...', 'fallback')).toBe('報告')
  })

  it('只有點號時退回預設', () => {
    expect(sanitizeFileName('.', 'fallback')).toBe('fallback')
    expect(sanitizeFileName('..', 'fallback')).toBe('fallback')
  })

  it('截斷後結尾若是空白也會被清掉', () => {
    // 79 個字加一個空白，截斷在第 80 個字元（空白）上
    const input = 'あ'.repeat(79) + ' ' + 'い'.repeat(50)
    expect(sanitizeFileName(input, 'fallback')).toBe('あ'.repeat(79))
  })

  it('中間的點號保留（副檔名以外的點是合法的）', () => {
    expect(sanitizeFileName('2026.10.26 報告', 'fallback')).toBe('2026.10.26 報告')
  })
})
