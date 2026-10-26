import type { ImageExportProgress } from '../core/pageToImage'

type Props = {
  selectMode: boolean
  totalPages: number
  selectedCount: number
  onToggleMode: (on: boolean) => void
  onInvert: () => void
  onRemoveSelected: () => void
  onExport: () => void
  progress: ImageExportProgress | null
  /** 主按鈕做什麼，由卡片決定。另一種以次要按鈕出現 */
  primaryExport: 'pdf' | 'images'
  onExportImages: () => void
  jpegAvailable: boolean
  onExportJpeg: () => void
}

export function ActionBar({
  selectMode,
  totalPages,
  selectedCount,
  onToggleMode,
  onInvert,
  onRemoveSelected,
  onExport,
  progress,
  primaryExport,
  onExportImages,
  jpegAvailable,
  onExportJpeg,
}: Props) {
  const busy = progress !== null
  const canExport = !busy && (selectMode ? selectedCount > 0 : totalPages > 0)
  // 轉圖片一定要先勾選——非勾選模式下「整份轉圖片」很容易一次轉出上百張
  const imagesReady = !busy && selectMode && selectedCount > 0

  const pdfLabel = selectMode ? `匯出勾選的 ${selectedCount} 頁` : '匯出 PDF'
  const imagesLabel = `匯出勾選的 ${selectedCount} 頁為圖片`

  const busyLabel =
    progress && progress.total > 1 ? `處理中 ${progress.done}/${progress.total}` : '處理中'

  const primaryIsImages = primaryExport === 'images'
  const primaryLabel = busy ? busyLabel : primaryIsImages ? imagesLabel : pdfLabel
  const primaryDisabled = primaryIsImages ? !imagesReady : !canExport
  const onPrimary = primaryIsImages ? onExportImages : onExport

  return (
    <div className="action-bar">
      <div className="action-row">
        <button className="text-button" onClick={() => onToggleMode(!selectMode)}>
          {selectMode ? '離開勾選' : '勾選抽頁'}
        </button>
        {selectMode && (
          <button className="text-button" onClick={onInvert}>
            反轉勾選
          </button>
        )}
      </div>
      <button className="primary-button" disabled={primaryDisabled} onClick={onPrimary}>
        {primaryLabel}
      </button>
      {primaryIsImages ? (
        <button className="text-button jpeg-button" disabled={!canExport} onClick={onExport}>
          改成匯出 PDF
        </button>
      ) : (
        imagesReady && (
          <button className="text-button jpeg-button" disabled={busy} onClick={onExportImages}>
            改成匯出勾選的 {selectedCount} 頁為圖片
          </button>
        )
      )}
      {jpegAvailable && (
        <button className="text-button jpeg-button" disabled={busy} onClick={onExportJpeg}>
          改成匯出 JPEG
        </button>
      )}
      {selectMode && primaryExport === 'pdf' && (
        <p className="action-hint">
          分割的做法：先匯出勾選的頁，回來按「反轉勾選」再匯出一次，就得到兩份。
        </p>
      )}
      {selectMode && selectedCount > 0 && (
        <button className="text-button danger remove-selected" onClick={onRemoveSelected}>
          刪除勾選的 {selectedCount} 頁
        </button>
      )}
    </div>
  )
}
