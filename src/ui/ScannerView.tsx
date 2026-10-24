import { useEffect, useRef, useState } from 'react'
import { CropOverlay } from './CropOverlay'
import { captureFrame, defaultQuad, openRearCamera, rasterToJpegBlob } from '../core/scanner/camera'
import { estimateOutputSize, warpPerspective, type Quad } from '../core/scanner/geometry'
import { FILTER_LABELS, applyFilter, type FilterMode } from '../core/scanner/filters'
import type { RasterImage } from '../types'

type Props = {
  onCaptured: (blob: Blob) => void
  onCancel: () => void
}

type Stage =
  | { name: 'opening' }
  | { name: 'denied' | 'unavailable' }
  | { name: 'preview' }
  | { name: 'crop'; frame: RasterImage; quad: Quad; filter: FilterMode }

export function ScannerView({ onCaptured, onCancel }: Props) {
  const [stage, setStage] = useState<Stage>({ name: 'opening' })
  const [working, setWorking] = useState(false)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const attachStream = (stream: MediaStream) => {
    streamRef.current = stream
    if (videoRef.current) videoRef.current.srcObject = stream
  }

  useEffect(() => {
    let cancelled = false
    openRearCamera().then(result => {
      if (cancelled) {
        if (result.ok) result.stream.getTracks().forEach(t => t.stop())
        return
      }
      if (!result.ok) {
        setStage({ name: result.reason })
        return
      }
      attachStream(result.stream)
      setStage({ name: 'preview' })
    })
    // 卸載時一定要停掉相機，否則鏡頭燈會一直亮著
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  // 從裁切回到取景時 <video> 會重新掛載，需要把既有的串流接回去
  useEffect(() => {
    if (stage.name === 'preview' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [stage.name])

  // 裁切階段用拍下的影格當底圖。blob URL 在 cleanup 一定要 revoke，
  // 並用 cancelled 旗標處理「blob 還沒產生完就已經離開」的競態。
  const cropFrame = stage.name === 'crop' ? stage.frame : null
  useEffect(() => {
    if (!cropFrame) {
      setFrameUrl(null)
      return
    }
    let cancelled = false
    let url: string | null = null
    rasterToJpegBlob(cropFrame).then(blob => {
      if (cancelled) return
      url = URL.createObjectURL(blob)
      setFrameUrl(url)
    })
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [cropFrame])

  const capture = () => {
    if (!videoRef.current) return
    try {
      const frame = captureFrame(videoRef.current)
      setStage({ name: 'crop', frame, quad: defaultQuad(frame.width, frame.height), filter: 'enhance' })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '擷取失敗')
    }
  }

  const confirm = async () => {
    if (stage.name !== 'crop') return
    setWorking(true)
    try {
      // 下面的 warpPerspective 與 applyFilter 是同步的重運算，會把主執行緒擋住。
      // 不先讓出一次 paint 的話，上面剛設的「處理中」永遠不會被畫出來，
      // 使用者按下去會覺得沒反應。
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)))
      const size = estimateOutputSize(stage.quad)
      const warped = warpPerspective(stage.frame, stage.quad, size.width, size.height)
      const filtered = applyFilter(warped, stage.filter)
      onCaptured(await rasterToJpegBlob(filtered))
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '處理失敗')
      setWorking(false)
    }
  }

  if (stage.name === 'denied' || stage.name === 'unavailable') {
    return (
      <>
        <header className="editor-header">
          <button className="back-button" onClick={onCancel}>
            返回
          </button>
          <h1>相機無法使用</h1>
        </header>
        <p className="empty-state">
          {stage.name === 'denied'
            ? '相機權限被拒絕。請到 Safari 設定裡允許這個網站使用相機，或改用「加入照片」從相簿選取。'
            : '這個瀏覽器無法使用相機。請改用「加入照片」從相簿選取。'}
        </p>
      </>
    )
  }

  if (stage.name === 'crop') {
    return (
      <>
        <header className="editor-header">
          <button className="back-button" onClick={() => setStage({ name: 'preview' })}>
            重拍
          </button>
          <h1>調整範圍</h1>
        </header>

        <div className="crop-stage">
          <CropOverlay
            imageWidth={stage.frame.width}
            imageHeight={stage.frame.height}
            backgroundUrl={frameUrl}
            quad={stage.quad}
            onChange={quad => setStage({ ...stage, quad })}
          />
        </div>

        <div className="filter-row">
          {(Object.keys(FILTER_LABELS) as FilterMode[]).map(mode => (
            <button
              key={mode}
              className={mode === stage.filter ? 'source-button active' : 'source-button'}
              onClick={() => setStage({ ...stage, filter: mode })}
            >
              {FILTER_LABELS[mode]}
            </button>
          ))}
        </div>

        <div className="action-bar">
          <button className="primary-button" disabled={working} onClick={confirm}>
            {working ? '處理中' : '加入這一頁'}
          </button>
          <p className="action-hint">拖四個圓點對齊紙張的四個角。校正後會自動拉正。</p>
        </div>
      </>
    )
  }

  return (
    <>
      <header className="editor-header">
        <button className="back-button" onClick={onCancel}>
          返回
        </button>
        <h1>掃描</h1>
      </header>

      <div className="camera-stage">
        <video ref={videoRef} autoPlay playsInline muted data-testid="camera-preview" />
        {stage.name === 'opening' && <p className="empty-state">正在開啟相機</p>}
      </div>

      <div className="action-bar">
        <button className="primary-button" disabled={stage.name !== 'preview'} onClick={capture}>
          拍攝
        </button>
      </div>
    </>
  )
}
