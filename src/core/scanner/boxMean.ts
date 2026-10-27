/**
 * 用積分圖算每個像素周圍 (2r+1)^2 範圍的平均值。
 * 邊界用夾限而非補零，所以邊緣不會被壓暗。
 *
 * 輸入型別是 ArrayLike<number> 而不是 Uint8ClampedArray，
 * 因為偵測管線傳進來的是降採樣後的 Float32Array 灰階。
 */
export function boxMean(
  values: ArrayLike<number>,
  width: number,
  height: number,
  radius: number,
): Float32Array {
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
