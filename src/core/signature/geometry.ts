import type { Rotation } from '../../types'

/** 0..1 正規化座標，原點左上、y 軸向下 */
export type NormalizedPoint = { x: number; y: number }

/** 覆蓋層在未旋轉頁面空間的位置與寬度。高度由簽名長寬比算出，不另存 */
export type OverlayBox = { x: number; y: number; width: number }

/** PDF 使用者空間的盒子，原點左下、y 軸向上 */
export type PdfBox = { x: number; y: number; width: number; height: number }

export type PdfRect = { x: number; y: number; width: number; height: number }

export type StrokePoint = { x: number; y: number }

export type InkBounds = { minX: number; minY: number; maxX: number; maxY: number }

/** 覆蓋層寬度佔頁寬的下限與上限 */
export const MIN_OVERLAY_WIDTH = 0.05
export const MAX_OVERLAY_WIDTH = 1

/**
 * 未旋轉頁面空間 → 顯示空間。
 * r 為順時針角度，與 PDF 的 /Rotate 及 CSS 的 rotate() 同向。
 */
export function toDisplaySpace(point: NormalizedPoint, rotation: Rotation): NormalizedPoint {
  switch (rotation) {
    case 90:
      return { x: 1 - point.y, y: point.x }
    case 180:
      return { x: 1 - point.x, y: 1 - point.y }
    case 270:
      return { x: point.y, y: 1 - point.x }
    default:
      return { x: point.x, y: point.y }
  }
}

/** 顯示空間 → 未旋轉頁面空間，是 toDisplaySpace 的反函式 */
export function toUnrotatedSpace(point: NormalizedPoint, rotation: Rotation): NormalizedPoint {
  switch (rotation) {
    case 90:
      return { x: point.y, y: 1 - point.x }
    case 180:
      return { x: 1 - point.x, y: 1 - point.y }
    case 270:
      return { x: 1 - point.y, y: point.x }
    default:
      return { x: point.x, y: point.y }
  }
}

/**
 * 把未旋轉空間的覆蓋層換算成 PDF 使用者空間的矩形。
 *
 * 不需要處理旋轉：pdf-lib 的使用者空間不受 /Rotate 影響，而覆蓋層存的就是
 * 未旋轉座標，兩者是同一個空間。/Rotate 會讓頁面連同簽名一起旋轉顯示。
 *
 * box 對 PDF 頁是 MediaBox（原點可能不在 (0,0)），對影像頁是 fitOnA4 的 placement。
 */
export function normalizedToPdfRect(
  overlay: OverlayBox,
  box: PdfBox,
  signatureAspect: number,
): PdfRect {
  const width = overlay.width * box.width
  const height = width * signatureAspect
  return {
    x: box.x + overlay.x * box.width,
    // overlay.y 由上往下，PDF 的 y 由下往上，所以從盒子頂端往下量再扣掉高度
    y: box.y + box.height - overlay.y * box.height - height,
    width,
    height,
  }
}

/** 把覆蓋層夾限在頁面範圍內，並限制寬度 */
export function clampOverlayBox(overlay: OverlayBox, signatureAspect: number): OverlayBox {
  let width = Math.min(MAX_OVERLAY_WIDTH, Math.max(MIN_OVERLAY_WIDTH, overlay.width))
  // 細長的簽名在寬度合法時仍可能高過整頁，此時以高度為準回推寬度
  if (width * signatureAspect > 1) width = 1 / signatureAspect
  const height = width * signatureAspect
  return {
    x: Math.min(Math.max(0, overlay.x), Math.max(0, 1 - width)),
    y: Math.min(Math.max(0, overlay.y), Math.max(0, 1 - height)),
    width,
  }
}

/**
 * 所有筆畫的外接矩形，含筆畫寬度造成的外擴。
 * 沒有任何點時回傳 null。
 */
export function inkBounds(strokes: StrokePoint[][], strokeWidth: number): InkBounds | null {
  const half = strokeWidth / 2
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const stroke of strokes) {
    for (const point of stroke) {
      if (point.x - half < minX) minX = point.x - half
      if (point.y - half < minY) minY = point.y - half
      if (point.x + half > maxX) maxX = point.x + half
      if (point.y + half > maxY) maxY = point.y + half
    }
  }

  if (minX === Infinity) return null
  return { minX, minY, maxX, maxY }
}
