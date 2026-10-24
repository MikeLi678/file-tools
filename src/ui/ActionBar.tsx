type Props = {
  selectMode: boolean
  totalPages: number
  selectedCount: number
  onToggleMode: (on: boolean) => void
  onInvert: () => void
  onExport: () => void
  exporting: boolean
  /** Task 13 才會傳真值，這裡先接住 */
  jpegAvailable: boolean
  onExportJpeg: () => void
}

export function ActionBar({
  selectMode,
  totalPages,
  selectedCount,
  onToggleMode,
  onInvert,
  onExport,
  exporting,
  // jpegAvailable、onExportJpeg 留在 Props，Task 13 才會解構使用
}: Props) {
  const canExport = !exporting && (selectMode ? selectedCount > 0 : totalPages > 0)

  const exportLabel = exporting
    ? '處理中'
    : selectMode
      ? `匯出勾選的 ${selectedCount} 頁`
      : '匯出 PDF'

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
      <button className="primary-button" disabled={!canExport} onClick={onExport}>
        {exportLabel}
      </button>
      {selectMode && (
        <p className="action-hint">
          分割的做法：先匯出勾選的頁，回來按「反轉勾選」再匯出一次，就得到兩份。
        </p>
      )}
    </div>
  )
}
