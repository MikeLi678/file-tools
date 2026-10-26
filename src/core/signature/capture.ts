import { LIMITS } from '../limits'
import { inkBounds, type InkBounds, type StrokePoint } from './geometry'

/** 筆畫寬度，以擷取畫布的 CSS 像素為單位 */
export const STROKE_WIDTH = 3

export type CaptureSize = { width: number; height: number; scale: number }

export type CaptureResult = {
  blob: Blob
  width: number
  height: number
}

/**
 * 依筆跡外接矩形算出輸出尺寸。長邊超過上限時等比縮小，不足則維持原尺寸
 * （放大線條不會變清楚，只是變大）。
 */
export function captureSize(bounds: InkBounds): CaptureSize {
  const rawWidth = bounds.maxX - bounds.minX
  const rawHeight = bounds.maxY - bounds.minY
  const longest = Math.max(rawWidth, rawHeight)
  const scale = longest > LIMITS.signatureCaptureEdge ? LIMITS.signatureCaptureEdge / longest : 1
  return {
    width: Math.max(1, Math.round(rawWidth * scale)),
    height: Math.max(1, Math.round(rawHeight * scale)),
    scale,
  }
}

/**
 * 把折線畫到 context 上。在相鄰點的中點之間用二次貝茲平滑，
 * 直接連線會在手指快速移動時出現明顯折角。
 */
export function drawStrokes(
  context: CanvasRenderingContext2D,
  strokes: StrokePoint[][],
  strokeWidth: number,
): void {
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = '#14141e'
  context.lineWidth = strokeWidth

  for (const stroke of strokes) {
    if (stroke.length === 0) continue
    if (stroke.length === 1) {
      // 單點要畫成圓點，否則點一下不會留下任何痕跡
      context.beginPath()
      context.arc(stroke[0].x, stroke[0].y, strokeWidth / 2, 0, Math.PI * 2)
      context.fillStyle = context.strokeStyle
      context.fill()
      continue
    }
    context.beginPath()
    context.moveTo(stroke[0].x, stroke[0].y)
    for (let i = 1; i < stroke.length - 1; i += 1) {
      const midX = (stroke[i].x + stroke[i + 1].x) / 2
      const midY = (stroke[i].y + stroke[i + 1].y) / 2
      context.quadraticCurveTo(stroke[i].x, stroke[i].y, midX, midY)
    }
    const last = stroke[stroke.length - 1]
    context.lineTo(last.x, last.y)
    context.stroke()
  }
}

/**
 * 折線 → 裁切到筆跡範圍的透明 PNG。
 * 不裁切的話整張畫布大半是空白，定位與縮放都會在跟空白搏鬥。
 * 沒有任何筆畫時回傳 null。
 */
export async function strokesToPng(strokes: StrokePoint[][]): Promise<CaptureResult | null> {
  const bounds = inkBounds(strokes, STROKE_WIDTH)
  if (!bounds) return null

  const size = captureSize(bounds)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height

  try {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('無法取得 canvas context')
    // 把外接矩形的左上角移到原點，再套用縮放
    context.scale(size.scale, size.scale)
    context.translate(-bounds.minX, -bounds.minY)
    drawStrokes(context, strokes, STROKE_WIDTH)

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('簽名輸出失敗')
    if (blob.size > LIMITS.maxSignatureBytes) throw new Error('簽名檔案過大')
    return { blob, width: size.width, height: size.height }
  } finally {
    canvas.width = 0
    canvas.height = 0
  }
}
