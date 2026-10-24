import { useEffect, useRef, useState } from 'react'
import type { Point, Quad } from '../core/scanner/geometry'

type Props = {
  /** 被裁切影像的實際像素尺寸 */
  imageWidth: number
  imageHeight: number
  /** 底圖的 blob URL，由呼叫端負責建立與 revoke */
  backgroundUrl: string | null
  quad: Quad
  onChange: (quad: Quad) => void
}

const CORNER_LABELS = ['左上', '右上', '右下', '左下']

export function CropOverlay({ imageWidth, imageHeight, backgroundUrl, quad, onChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  // SVG 用 viewBox 縮放顯示，所以螢幕上的 44pt 換算回影像座標要先知道縮放比。
  // 用 ResizeObserver 追蹤，螢幕旋轉或視窗變化時會重新量。
  const [imageUnitsPerPixel, setImageUnitsPerPixel] = useState(1)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const update = () => {
      const rect = svg.getBoundingClientRect()
      if (rect.width > 0) setImageUnitsPerPixel(imageWidth / rect.width)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [imageWidth])

  // 指標座標要換算回影像的像素座標，因為 SVG 用 viewBox 縮放顯示
  const toImageSpace = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * imageWidth,
      y: ((clientY - rect.top) / rect.height) * imageHeight,
    }
  }

  const clamp = (p: Point): Point => ({
    x: Math.min(imageWidth, Math.max(0, p.x)),
    y: Math.min(imageHeight, Math.max(0, p.y)),
  })

  const startDrag = (index: number) => (event: React.PointerEvent<SVGCircleElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)

    const move = (e: PointerEvent) => {
      const next = [...quad] as Quad
      next[index] = clamp(toImageSpace(e.clientX, e.clientY))
      onChange(next)
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  const points = quad.map(p => `${p.x},${p.y}`).join(' ')
  const handleRadius = Math.max(imageWidth, imageHeight) * 0.025
  // iOS 建議的最小點擊目標是 44pt，所以命中區半徑取 22px 換算成影像單位。
  // 視覺上的圓維持原本大小，命中區只是看不見地變大。
  const hitRadius = Math.max(handleRadius, 22 * imageUnitsPerPixel)

  return (
    <svg
      ref={svgRef}
      className="crop-overlay"
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {backgroundUrl && <image href={backgroundUrl} x={0} y={0} width={imageWidth} height={imageHeight} />}
      <polygon points={points} className="crop-polygon" />
      {quad.map((corner, index) => (
        <g key={index}>
          <circle cx={corner.x} cy={corner.y} r={handleRadius} className="crop-handle" />
          {/* 看不見的命中區。data-testid 掛在這裡，因為它才是真正接事件的元素 */}
          <circle
            cx={corner.x}
            cy={corner.y}
            r={hitRadius}
            className="crop-hit"
            data-testid={`crop-handle-${index}`}
            aria-label={`${CORNER_LABELS[index]}裁切點`}
            onPointerDown={startDrag(index)}
          />
        </g>
      ))}
    </svg>
  )
}
