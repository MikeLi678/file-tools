import {
  useEffect,
  useState,
  type HTMLAttributes,
  type MouseEvent,
  type Ref,
  type TouchEvent,
} from 'react'
import type { LoadedPdf, Page } from '../types'
import type { Thumbnailer } from '../core/thumbnailer'

type Props = {
  page: Page
  index: number
  loadedFiles: Record<string, LoadedPdf>
  thumbnailer: Thumbnailer
  dragging?: boolean
  containerRef?: Ref<HTMLDivElement>
  containerProps?: HTMLAttributes<HTMLDivElement>
  onRotate: (pageId: string) => void
  onRemove: (pageId: string) => void
}

export function PageTile({
  page,
  index,
  loadedFiles,
  thumbnailer,
  dragging = false,
  containerRef,
  containerProps,
  onRotate,
  onRemove,
}: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    thumbnailer
      .get(page, loadedFiles)
      .then(result => {
        if (!cancelled) setUrl(result)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [page, page.rotation, loadedFiles, thumbnailer])

  // 按鈕上的按下事件不能冒泡到 dnd-kit 的 sensor，否則按下按鈕的瞬間會被當成開始拖曳。
  // 必須同時擋 mousedown 與 touchstart：sensors 是 MouseSensor（聽 mousedown）
  // 與 TouchSensor（聽 touchstart），擋 pointerdown 對這兩者都無效，
  // 因為 pointer 事件與 mouse／touch 事件是各自獨立的事件物件。
  const stopDrag = {
    onMouseDown: (event: MouseEvent<HTMLButtonElement>) => event.stopPropagation(),
    onTouchStart: (event: TouchEvent<HTMLButtonElement>) => event.stopPropagation(),
  }

  return (
    <div
      ref={containerRef}
      className={dragging ? 'page-tile dragging' : 'page-tile'}
      data-testid="page-tile"
      data-page-index={index}
      {...containerProps}
    >
      <div className="page-thumb">
        {url && !failed && <img src={url} alt={`第 ${index + 1} 頁`} draggable={false} />}
        {!url && !failed && <span className="thumb-placeholder">載入中</span>}
        {failed && <span className="thumb-placeholder">縮圖失敗</span>}
      </div>
      <span className="page-number">{index + 1}</span>
      <div className="tile-actions">
        <button
          className="tile-button"
          aria-label={`旋轉第 ${index + 1} 頁`}
          data-testid="rotate"
          {...stopDrag}
          onClick={() => onRotate(page.id)}
        >
          旋轉
        </button>
        <button
          className="tile-button danger"
          aria-label={`刪除第 ${index + 1} 頁`}
          data-testid="remove"
          {...stopDrag}
          onClick={() => onRemove(page.id)}
        >
          刪除
        </button>
      </div>
    </div>
  )
}
