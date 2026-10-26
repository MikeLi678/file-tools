import { useEffect, useRef, useState } from 'react'
import { STROKE_WIDTH, drawStrokes, strokesToPng } from '../core/signature/capture'
import type { StrokePoint } from '../core/signature/geometry'
import { newId } from '../ids'
import type { StoredSignature } from '../core/signature/store'

type Props = {
  onCancel: () => void
  onSaved: (signature: StoredSignature) => void
}

export function SignatureCapture({ onCancel, onSaved }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const strokesRef = useRef<StrokePoint[][]>([])
  const drawingRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)
  const [saving, setSaving] = useState(false)

  // 畫布的實際像素要跟著裝置像素比，否則在 iPhone 上線條會模糊
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.round(rect.width * ratio)
    canvas.height = Math.round(rect.height * ratio)
    const context = canvas.getContext('2d')
    if (context) context.scale(ratio, ratio)
  }, [])

  const redraw = () => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const ratio = window.devicePixelRatio || 1
    context.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio)
    drawStrokes(context, strokesRef.current, STROKE_WIDTH)
  }

  const pointFrom = (event: React.PointerEvent<HTMLCanvasElement>): StrokePoint => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    strokesRef.current = [...strokesRef.current, [pointFrom(event)]]
    setHasInk(true)
    redraw()
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const strokes = strokesRef.current
    strokes[strokes.length - 1].push(pointFrom(event))
    redraw()
  }

  const handlePointerUp = () => {
    drawingRef.current = false
  }

  const handleClear = () => {
    strokesRef.current = []
    setHasInk(false)
    redraw()
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await strokesToPng(strokesRef.current)
      if (!result) return
      onSaved({
        id: newId(),
        blob: result.blob,
        width: result.width,
        height: result.height,
        createdAt: Date.now(),
      })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '簽名儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="signature-capture">
      <header className="editor-header">
        <button className="back-button" onClick={onCancel}>
          取消
        </button>
        <h1>簽名</h1>
      </header>
      <p className="action-hint">用手指在下面的框裡簽名。</p>
      <canvas
        ref={canvasRef}
        className="signature-pad"
        data-testid="signature-pad"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />
      <div className="action-row">
        <button className="text-button" onClick={handleClear} disabled={!hasInk || saving}>
          清除
        </button>
      </div>
      <button className="primary-button" onClick={handleSave} disabled={!hasInk || saving}>
        {saving ? '處理中' : '儲存簽名'}
      </button>
    </div>
  )
}
