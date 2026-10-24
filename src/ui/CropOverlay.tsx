import { useRef } from 'react'
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
        <circle
          key={index}
          cx={corner.x}
          cy={corner.y}
          r={handleRadius}
          className="crop-handle"
          data-testid={`crop-handle-${index}`}
          aria-label={`${CORNER_LABELS[index]}裁切點`}
          onPointerDown={startDrag(index)}
        />
      ))}
    </svg>
  )
}
