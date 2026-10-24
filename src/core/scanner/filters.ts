import type { RasterImage } from '../../types'

export type FilterMode = 'original' | 'enhance' | 'mono'

export const FILTER_LABELS: Record<FilterMode, string> = {
  original: '原色',
  enhance: '增強',
  mono: '黑白',
}

/** 自適應二值化的局部平均半徑，以及判定門檻的寬容值 */
const MONO_RADIUS = 15
const MONO_BIAS = 10

export function applyFilter(img: RasterImage, mode: FilterMode): RasterImage {
  if (mode === 'original') return cloneImage(img)
  if (mode === 'enhance') return enhance(img)
  return mono(img)
}

function cloneImage(img: RasterImage): RasterImage {
  return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) }
}

/**
 * 逐通道取 1% 與 99% 百分位，線性拉伸到 0-255。
 * 逐通道而非統一處理，因此同時校正了色偏（偏黃的紙會被拉回接近白）。
 * 通道範圍退化時原值保留，避免把純色圖放大成雜訊。
 */
function enhance(img: RasterImage): RasterImage {
  const out = cloneImage(img)
  const pixelCount = img.width * img.height

  for (let channel = 0; channel < 3; channel++) {
    const { low, high } = percentiles(img, channel, pixelCount)
    if (high <= low) continue
    const scale = 255 / (high - low)
    for (let i = channel; i < out.data.length; i += 4) {
      out.data[i] = Math.round((img.data[i] - low) * scale)
    }
  }

  return out
}

function percentiles(img: RasterImage, channel: number, pixelCount: number): { low: number; high: number } {
  const histogram = new Uint32Array(256)
  for (let i = channel; i < img.data.length; i += 4) histogram[img.data[i]]++

  const lowTarget = Math.max(1, Math.floor(pixelCount * 0.01))
  const highTarget = Math.ceil(pixelCount * 0.99)

  let low = 0
  let cumulative = 0
  for (let v = 0; v < 256; v++) {
    cumulative += histogram[v]
    if (cumulative >= lowTarget) {
      low = v
      break
    }
  }

  let high = 255
  cumulative = 0
  for (let v = 0; v < 256; v++) {
    cumulative += histogram[v]
    if (cumulative >= highTarget) {
      high = v
      break
    }
  }

  return { low, high }
}

/**
 * 自適應二值化：拿每個像素與自己周圍的平均亮度比較，而非全圖的單一門檻。
 * 這樣拍照時一側偏暗的陰影不會整片變黑。
 */
function mono(img: RasterImage): RasterImage {
  const { width, height } = img
  const luminance = new Uint8ClampedArray(width * height)
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    luminance[i] = Math.round(0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2])
  }

  const localMean = boxMean(luminance, width, height, MONO_RADIUS)
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const value = luminance[i] > localMean[i] - MONO_BIAS ? 255 : 0
    const o = i * 4
    data[o] = value
    data[o + 1] = value
    data[o + 2] = value
    data[o + 3] = 255
  }

  return { width, height, data }
}

/** 用積分影像算盒狀平均，複雜度與半徑無關 */
function boxMean(values: Uint8ClampedArray, width: number, height: number, radius: number): Float32Array {
  const stride = width + 1
  const integral = new Float64Array(stride * (height + 1))

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      integral[(y + 1) * stride + (x + 1)] =
        values[y * width + x] +
        integral[y * stride + (x + 1)] +
        integral[(y + 1) * stride + x] -
        integral[y * stride + x]
    }
  }

  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius)
      const y0 = Math.max(0, y - radius)
      const x1 = Math.min(width - 1, x + radius)
      const y1 = Math.min(height - 1, y + radius)
      const sum =
        integral[(y1 + 1) * stride + (x1 + 1)] -
        integral[y0 * stride + (x1 + 1)] -
        integral[(y1 + 1) * stride + x0] +
        integral[y0 * stride + x0]
      out[y * width + x] = sum / ((x1 - x0 + 1) * (y1 - y0 + 1))
    }
  }

  return out
}
