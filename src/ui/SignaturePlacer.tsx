import { useEffect, useRef, useState } from 'react'
import { pdfjs } from '../core/pdfjs'
import { clampOverlayBox, overlayHeight, toUnrotatedSpace } from '../core/signature/geometry'
import type { NormalizedPoint } from '../core/signature/geometry'
import { LIMITS } from '../core/limits'
import { newId } from '../ids'
import type { LoadedPdf, Page, SignatureOverlay } from '../types'
import type { StoredSignature } from '../core/signature/store'

type Props = {
  page: Page
  pageIndex: number
  loadedFiles: Record<string, LoadedPdf>
  signature: StoredSignature
  signatures: Record<string, StoredSignature>
  onAdd: (overlay: SignatureOverlay) => void
  onUpdate: (overlayId: string, patch: Partial<Omit<SignatureOverlay, 'id' | 'signatureId'>>) => void
  onRemove: (overlayId: string) => void
  onDone: () => void
}

/** 新簽名的預設位置：水平置中、垂直 75%（簽名線通常在下方）、寬度佔頁寬 0.3 */
const DEFAULT_WIDTH = 0.3
const DEFAULT_Y = 0.75

export function SignaturePlacer({
  page,
  pageIndex,
  loadedFiles,
  signature,
  signatures,
  onAdd,
  onUpdate,
  onRemove,
  onDone,
}: Props) {
  const [pageUrl, setPageUrl] = useState<string | null>(null)
  const [aspect, setAspect] = useState(1)
  const [effective, setEffective] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const boxRef = useRef<HTMLDivElement | null>(null)
  const grabRef = useRef<{ dx: number; dy: number } | null>(null)
  const modeRef = useRef<'move' | 'resize' | null>(null)

  // 渲染頁面圖。PDF 頁一律用 rotation: 0 渲染，得到使用者空間的樣子，
  // 旋轉交給外層的 CSS transform，這樣覆蓋層的座標才能是直接的百分比。
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    const run = async () => {
      if (page.source.kind === 'image') {
        objectUrl = URL.createObjectURL(page.source.blob)
        const image = new Image()
        image.src = objectUrl
        await image.decode()
        if (cancelled) return
        setAspect(image.naturalHeight / image.naturalWidth)
        setEffective(((page.rotation % 360) + 360) % 360)
        setPageUrl(objectUrl)
        return
      }

      const file = loadedFiles[page.source.fileId]
      if (!file) return
      // pdf.js 會把 buffer 轉移給 worker，一定要傳副本
      const doc = await pdfjs.getDocument({ data: file.bytes.slice() }).promise
      try {
        const pdfPage = await doc.getPage(page.source.pageIndex + 1)
        // rotation: 0 取代頁面自身的 /Rotate，得到未旋轉的使用者空間
        const base = pdfPage.getViewport({ scale: 1, rotation: 0 })
        const scale = Math.min(2, 1200 / base.width)
        const viewport = pdfPage.getViewport({ scale, rotation: 0 })
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        try {
          const context = canvas.getContext('2d')
          if (!context) throw new Error('無法取得 canvas context')
          await pdfPage.render({ canvasContext: context, viewport }).promise
          const blob = await new Promise<Blob | null>(resolve =>
            canvas.toBlob(resolve, 'image/jpeg', LIMITS.jpegQuality),
          )
          if (!blob || cancelled) return
          objectUrl = URL.createObjectURL(blob)
          setAspect(viewport.height / viewport.width)
          setEffective(((pdfPage.rotate + page.rotation) % 360 + 360) % 360)
          setPageUrl(objectUrl)
        } finally {
          canvas.width = 0
          canvas.height = 0
          pdfPage.cleanup()
        }
      } finally {
        await doc.destroy()
      }
    }

    run().catch(() => {
      if (!cancelled) setPageUrl(null)
    })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [page, loadedFiles])

  // 每個用到的簽名都要一個 object URL
  useEffect(() => {
    const created: Record<string, string> = {}
    for (const stored of Object.values(signatures)) {
      created[stored.id] = URL.createObjectURL(stored.blob)
    }
    setUrls(created)
    return () => {
      for (const url of Object.values(created)) URL.revokeObjectURL(url)
    }
  }, [signatures])

  // 進畫面時若還沒有任何覆蓋層，先放一個在預設位置
  useEffect(() => {
    if (page.overlays.length > 0) {
      setActiveId(current => current ?? page.overlays[page.overlays.length - 1].id)
      return
    }
    if (page.overlays.length >= LIMITS.maxOverlaysPerPage) return
    const aspectOf = signature.height / signature.width
    const box = clampOverlayBox({ x: (1 - DEFAULT_WIDTH) / 2, y: DEFAULT_Y, width: DEFAULT_WIDTH }, aspectOf, aspect)
    const overlay = { id: newId(), signatureId: signature.id, ...box }
    onAdd(overlay)
    setActiveId(overlay.id)
    // 只在掛載時跑一次：之後的新增由使用者的動作觸發
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 指標位置 → 未旋轉空間的正規化座標 */
  const pointerToUnrotated = (clientX: number, clientY: number): NormalizedPoint | null => {
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return null
    const display = {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height,
    }
    return toUnrotatedSpace(display, effective as 0 | 90 | 180 | 270)
  }

  const activeOverlay = page.overlays.find(o => o.id === activeId) ?? null

  const handlePointerDown = (
    event: React.PointerEvent<HTMLElement>,
    overlay: SignatureOverlay,
    mode: 'move' | 'resize',
  ) => {
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    setActiveId(overlay.id)
    modeRef.current = mode
    const point = pointerToUnrotated(event.clientX, event.clientY)
    grabRef.current = point ? { dx: overlay.x - point.x, dy: overlay.y - point.y } : { dx: 0, dy: 0 }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const overlay = activeOverlay
    const mode = modeRef.current
    const grab = grabRef.current
    if (!overlay || !mode || !grab) return
    const point = pointerToUnrotated(event.clientX, event.clientY)
    if (!point) return
    const stored = signatures[overlay.signatureId]
    if (!stored) return
    const aspectOf = stored.height / stored.width

    if (mode === 'move') {
      const box = clampOverlayBox(
        { x: point.x + grab.dx, y: point.y + grab.dy, width: overlay.width },
        aspectOf,
        aspect,
      )
      onUpdate(overlay.id, { x: box.x, y: box.y, width: box.width })
      return
    }

    // 縮放：指標的 x 相對於覆蓋層左緣就是新寬度
    const box = clampOverlayBox(
      { x: overlay.x, y: overlay.y, width: point.x - overlay.x },
      aspectOf,
      aspect,
    )
    onUpdate(overlay.id, { x: box.x, y: box.y, width: box.width })
  }

  const handlePointerUp = () => {
    modeRef.current = null
    grabRef.current = null
  }

  // 旋轉 90 或 270 時顯示空間的長寬比互換
  const swap = effective === 90 || effective === 270
  const displayAspect = swap ? 1 / aspect : aspect

  return (
    <div className="signature-placer">
      <header className="editor-header">
        <button className="back-button" onClick={onDone}>
          完成
        </button>
        <h1>第 {pageIndex + 1} 頁</h1>
      </header>

      <p className="action-hint">拖動簽名調整位置，拖右下角的圓點調整大小。</p>

      <div className="placer-stage" style={{ aspectRatio: `1 / ${displayAspect}` }}>
        <div
          ref={boxRef}
          className="placer-page"
          style={{
            aspectRatio: `1 / ${aspect}`,
            transform: `rotate(${effective}deg)`,
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {pageUrl ? (
            <img className="placer-image" src={pageUrl} alt={`第 ${pageIndex + 1} 頁`} draggable={false} />
          ) : (
            <span className="thumb-placeholder">載入中</span>
          )}

          {page.overlays.map(overlay => {
            const stored = signatures[overlay.signatureId]
            if (!stored) return null
            const height = overlayHeight(overlay.width, stored.height / stored.width, aspect)
            return (
              <div
                key={overlay.id}
                className={['placer-overlay', overlay.id === activeId ? 'active' : ''].filter(Boolean).join(' ')}
                data-testid="placer-overlay"
                style={{
                  left: `${overlay.x * 100}%`,
                  top: `${overlay.y * 100}%`,
                  width: `${overlay.width * 100}%`,
                  height: `${height * 100}%`,
                }}
                onPointerDown={event => handlePointerDown(event, overlay, 'move')}
              >
                {urls[stored.id] && <img src={urls[stored.id]} alt="簽名" draggable={false} />}
                {overlay.id === activeId && (
                  <span
                    className="placer-handle"
                    data-testid="placer-handle"
                    onPointerDown={event => handlePointerDown(event, overlay, 'resize')}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {activeOverlay && (
        <button
          className="text-button danger"
          data-testid="remove-overlay"
          onClick={() => {
            onRemove(activeOverlay.id)
            setActiveId(null)
          }}
        >
          刪除這個簽名
        </button>
      )}
      <button className="primary-button" onClick={onDone}>
        完成
      </button>
    </div>
  )
}
