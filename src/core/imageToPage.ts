import { PDFDocument, degrees } from 'pdf-lib'
import type { Rotation } from '../types'

/** A4 的短邊與長邊，單位是 PDF point */
export const A4_SHORT = 595.28
export const A4_LONG = 841.89

export type A4Placement = {
  pageWidth: number
  pageHeight: number
  width: number
  height: number
  x: number
  y: number
}

/**
 * 依影像長寬比選擇 A4 的方向，等比縮放到最大可容納尺寸並置中。
 * 正方形視為直向。
 */
export function fitOnA4(imgWidth: number, imgHeight: number): A4Placement {
  const landscape = imgWidth > imgHeight
  const pageWidth = landscape ? A4_LONG : A4_SHORT
  const pageHeight = landscape ? A4_SHORT : A4_LONG
  const scale = Math.min(pageWidth / imgWidth, pageHeight / imgHeight)
  const width = imgWidth * scale
  const height = imgHeight * scale
  return {
    pageWidth,
    pageHeight,
    width,
    height,
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
  }
}

export function detectImageType(bytes: Uint8Array): 'jpeg' | 'png' | 'unknown' {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png'
  return 'unknown'
}

export async function appendImagePage(doc: PDFDocument, bytes: Uint8Array, rotation: Rotation): Promise<void> {
  const type = detectImageType(bytes)
  if (type === 'unknown') throw new Error('無法辨識的影像格式')

  const image = type === 'jpeg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
  const placement = fitOnA4(image.width, image.height)
  const page = doc.addPage([placement.pageWidth, placement.pageHeight])
  page.drawImage(image, {
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
  })
  page.setRotation(degrees(((rotation % 360) + 360) % 360))
}
