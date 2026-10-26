import {
  useEffect,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
  type TouchEvent,
} from 'react'
import type { LoadedPdf, Page } from '../types'
import type { Thumbnailer } from '../core/thumbnailer'
import { LIMITS } from '../core/limits'

type Props = {
  page: Page
  index: number
  loadedFiles: Record<string, LoadedPdf>
  thumbnailer: Thumbnailer
  dragging?: boolean
  containerRef?: Ref<HTMLDivElement>
  containerProps?: HTMLAttributes<HTMLDivElement>
  onSign: (pageId: string) => void
  onRotate: (pageId: string) => void
  onRemove: (pageId: string) => void
  selectMode: boolean
  onToggleSelect: (pageId: string) => void
}

export function PageTile({
  page,
  index,
  loadedFiles,
  thumbnailer,
  dragging = false,
  containerRef,
  containerProps,
  onSign,
  onRotate,
  onRemove,
  selectMode,
  onToggleSelect,
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
  // 三種都要擋，因為三個 sensor 各自監聽不同的事件：
  //   MouseSensor 聽 mousedown、TouchSensor 聽 touchstart、KeyboardSensor 聽 keydown。
  // 擋 pointerdown 對它們都無效，pointer 事件與 mouse／touch 事件是各自獨立的物件。
  const stopDrag = {
    onMouseDown: (event: MouseEvent<HTMLButtonElement>) => event.stopPropagation(),
    onTouchStart: (event: TouchEvent<HTMLButtonElement>) => event.stopPropagation(),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => event.stopPropagation(),
  }

  // 勾選模式下覆寫 dnd-kit 給的 role 與鍵盤行為。
  // 根 div 預設是 role="button" + tabIndex=0，Space 與 Enter 歸 KeyboardSensor 管
  // （拿起項目），所以鍵盤使用者按不到勾選，螢幕閱讀器聽到的也是「可拖曳的按鈕」
  // 而不是勾選框。這裡改成 checkbox 語意並自己處理按鍵——
  // 這個 onKeyDown 會蓋掉 containerProps 裡 dnd-kit 的同名 handler，
  // 等於勾選模式下停用鍵盤拖曳，換取鍵盤可以勾選。這是刻意的取捨。
  const selectModeProps = selectMode
    ? {
        role: 'checkbox',
        'aria-checked': page.selected,
        'aria-label': `第 ${index + 1} 頁`,
        'aria-roledescription': undefined,
        'aria-describedby': undefined,
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key !== ' ' && event.key !== 'Enter') return
          event.preventDefault()
          onToggleSelect(page.id)
        },
      }
    : {}

  return (
    <div
      ref={containerRef}
      className={[
        'page-tile',
        dragging ? 'dragging' : '',
        selectMode && page.selected ? 'selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={selectMode ? () => onToggleSelect(page.id) : undefined}
      data-selected={page.selected}
      data-testid="page-tile"
      data-page-index={index}
      {...containerProps}
      {...selectModeProps}
    >
      <div className="page-thumb">
        {url && !failed && <img src={url} alt={`第 ${index + 1} 頁`} draggable={false} />}
        {page.overlays.length > 0 && (
          <span className="thumb-signed" aria-label="已簽名">
            已簽名
          </span>
        )}
        {!url && !failed && <span className="thumb-placeholder">載入中</span>}
        {failed && <span className="thumb-placeholder">縮圖失敗</span>}
      </div>
      <span className="page-number" aria-hidden="true">{index + 1}</span>
      {selectMode ? (
        <div className="tile-actions">
          <span className="select-mark" aria-hidden="true">{page.selected ? '已勾選' : '未勾選'}</span>
        </div>
      ) : (
        <div className="tile-actions">
          <button
            className="tile-button"
            aria-label={`簽名第 ${index + 1} 頁`}
            data-testid="sign"
            disabled={page.overlays.length >= LIMITS.maxOverlaysPerPage}
            {...stopDrag}
            onClick={() => onSign(page.id)}
          >
            簽名
          </button>
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
      )}
    </div>
  )
}
