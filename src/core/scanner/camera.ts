import { LIMITS } from '../limits'
import type { RasterImage } from '../../types'
import type { Quad } from './geometry'

export type CameraResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: 'denied' | 'unavailable' }

export async function openRearCamera(): Promise<CameraResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: 'unavailable' }
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    })
    return { ok: true, stream }
  } catch (error) {
    const denied = error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
    return { ok: false, reason: denied ? 'denied' : 'unavailable' }
  }
}

/**
 * 擷取當前影格，並在超過 LIMITS.maxCaptureEdge 時等比降採樣。
 *
 * 為什麼需要上限：filters 的 mono 會配置 Float64 積分影像（8 bytes/px）
 * 加上 Float32 局部平均（4 bytes/px），峰值約是像素數的 13 倍位元組。
 * 1200 萬像素就接近 200 MB，iOS Safari 會直接把分頁殺掉。
 * getUserMedia 的 1920x1080 是 ideal 而非 exact，裝置可以給更高，所以這裡要硬擋。
 * 長邊 2400px 對 A4 約 200dpi，對 JPEG 0.85 的輸出品質足夠。
 */
export function captureFrame(video: HTMLVideoElement): RasterImage {
  const sourceWidth = video.videoWidth
  const sourceHeight = video.videoHeight
  if (sourceWidth === 0 || sourceHeight === 0) throw new Error('相機還沒準備好')

  const scale = Math.min(1, LIMITS.maxCaptureEdge / Math.max(sourceWidth, sourceHeight))
  const width = Math.round(sourceWidth * scale)
  const height = Math.round(sourceHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('無法取得 canvas context')
  context.drawImage(video, 0, 0, width, height)
  return context.getImageData(0, 0, width, height)
}

export async function rasterToJpegBlob(image: RasterImage): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('無法取得 canvas context')
  context.putImageData(new ImageData(image.data as Uint8ClampedArray<ArrayBuffer>, image.width, image.height), 0, 0)
  const blob = await new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, 'image/jpeg', LIMITS.jpegQuality),
  )
  if (!blob) throw new Error('影像輸出失敗')
  return blob
}

/** 初始裁切框是影像內縮 10% 的矩形。不做自動邊緣偵測。 */
export function defaultQuad(width: number, height: number): Quad {
  const insetX = width * 0.1
  const insetY = height * 0.1
  return [
    { x: insetX, y: insetY },
    { x: width - insetX, y: insetY },
    { x: width - insetX, y: height - insetY },
    { x: insetX, y: height - insetY },
  ]
}
