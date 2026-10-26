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
 * signatureAspect 是簽名的 pt 高 / 寬（簽名自己的長寬比，不是頁面的）。
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

/**
 * 覆蓋層的正規化高度（佔頁高的比例）。pageAspect 是「頁高 / 頁寬」。
 *
 * 不能直接寫 width * signatureAspect：width 是「佔頁寬」的比例，而
 * signatureAspect 是簽名自己的 pt 高/寬，兩者分母不同。實際高度是
 * width * pageWidth * signatureAspect，再除以 pageHeight 才是這裡的結果。
 * 只有正方形頁（pageAspect 為 1）時兩種寫法才相等——實測 A4 橫向用錯會讓
 * 簽名溢出頁底 8.3%，直向則永遠碰不到底部。
 */
export function overlayHeight(width: number, signatureAspect: number, pageAspect: number): number {
  return (width * signatureAspect) / pageAspect
}

/** 把覆蓋層夾限在頁面範圍內，並限制寬度。pageAspect 是「頁高 / 頁寬」 */
export function clampOverlayBox(
  overlay: OverlayBox,
  signatureAspect: number,
  pageAspect: number,
): OverlayBox {
  let width = Math.min(MAX_OVERLAY_WIDTH, Math.max(MIN_OVERLAY_WIDTH, overlay.width))
  // 寬度合法時高度仍可能超過整頁（細長的簽名），此時以高度為準回推寬度。
  // 這會讓寬度可能低於 MIN_OVERLAY_WIDTH——放得進頁面優先於寬度下限，
  // 否則簽名會直接溢出頁面，那是使用者看得到的錯誤。
  if (overlayHeight(width, signatureAspect, pageAspect) > 1) {
    width = pageAspect / signatureAspect
  }
  const height = overlayHeight(width, signatureAspect, pageAspect)
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
