import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectDocumentQuad } from './detect'
import type { RasterImage } from '../../types'

const FIX = join(__dirname, '../../../tests/fixtures')

type ScanCase = { name: string; quad: [number, number][]; width: number; height: number }

const cases: ScanCase[] = JSON.parse(readFileSync(join(FIX, 'scan-cases.json'), 'utf8'))
const byName = (n: string) => cases.find(c => c.name === n)!

function load(name: string): { img: RasterImage; truth: [number, number][] } {
  const c = byName(name)
  const buf = readFileSync(join(FIX, `scan-${name}.rgba`))
  return {
    img: { width: c.width, height: c.height, data: new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.length) },
    truth: c.quad,
  }
}

/** 四角與真值的平均距離 */
function averageError(got: { x: number; y: number }[], truth: [number, number][]): number {
  let sum = 0
  for (let i = 0; i < 4; i++) sum += Math.hypot(got[i].x - truth[i][0], got[i].y - truth[i][1])
  return sum / 4
}

describe('偵測準確度', () => {
  // 原型實測的平均角誤差：plain 1.2px、rotated 3.1px、perspective 3.3px、
  // clutter 4.7px、full 5.1px。門檻取影像長邊的 2%（24px），留足餘裕但仍能
  // 抓到「偵測整個歪掉」。相對誤差是 0.1-0.6%。
  const TOLERANCE_RATIO = 0.02

  for (const name of ['plain', 'rotated', 'perspective', 'clutter', 'full']) {
    it(`${name}：四角誤差小於影像長邊的 2%`, () => {
      const { img, truth } = load(name)
      const quad = detectDocumentQuad(img)
      expect(quad, `${name} 應該偵測成功`).not.toBeNull()
      const tolerance = Math.max(img.width, img.height) * TOLERANCE_RATIO
      expect(averageError(quad!, truth)).toBeLessThan(tolerance)
    })
  }
})

describe('偵測失敗時回傳 null，不給自信的錯答案', () => {
  // 這三個是刻意的行為，不是缺陷：
  //   lowcontrast 紙與桌面只差十幾個灰階，文件被自己的內文蓋掉
  //   offcenter、cropped 的文件不在畫面中央或被切掉，不滿足選線的跨中心條件
  for (const name of ['lowcontrast', 'offcenter', 'cropped']) {
    it(`${name}：回傳 null`, () => {
      const { img } = load(name)
      expect(detectDocumentQuad(img)).toBeNull()
    })
  }
})
