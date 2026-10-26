import { useState } from 'react'
import { canShareFiles, formatBytes, sanitizeFileName, shareFiles, type ExportedFile } from '../core/output'

type Props = {
  files: ExportedFile[]
  onBackToEditor: () => void
  onHome: () => void
}

export function ExportResult({ files, onBackToEditor, onHome }: Props) {
  // 第一個檔名形如 file-tools-20261026-1130.pdf 或 ...-1130-1.jpg，拆成基底與副檔名。
  // 使用者只改基底，副檔名由程式決定。
  const first = files[0]
  const dotIndex = first.fileName.lastIndexOf('.')
  const rawBase = first.fileName.slice(0, dotIndex)
  // 只有多檔時才有序號後綴要拿掉；單檔的 -1130 是時間戳的一部分，不能剝
  const defaultBase = files.length > 1 ? rawBase.replace(/-\d+$/, '') : rawBase
  const extension = first.fileName.slice(dotIndex)
  const [nameInput, setNameInput] = useState(defaultBase)
  const base = sanitizeFileName(nameInput, defaultBase)

  // 單檔用基底名稱，多檔加序號
  const named = files.map((file, index) => ({
    ...file,
    fileName: files.length === 1 ? base + extension : `${base}-${index + 1}${extension}`,
  }))

  const totalBytes = files.reduce((sum, file) => sum + file.blob.size, 0)
  const [done, setDone] = useState(false)
  const shareable = canShareFiles(named)

  // 不要 await 後才呼叫 shareFiles——它內部需要同步進入 navigator.share
  const handleSave = () => {
    shareFiles(named)
      .then(result => {
        if (result !== 'cancelled') setDone(true)
      })
      .catch(() => window.alert('儲存失敗，請再試一次'))
  }

  return (
    <>
      <header className="editor-header">
        <button className="back-button" onClick={onBackToEditor}>
          返回編輯
        </button>
        <h1>匯出完成</h1>
      </header>

      <div className="result-card">
        <label className="name-field">
          <span className="name-label">檔名</span>
          <span className="name-row">
            <input
              className="name-input"
              value={nameInput}
              onChange={event => setNameInput(event.target.value)}
              aria-label="輸出檔名"
              enterKeyHint="done"
            />
            <span className="name-extension">{extension}</span>
          </span>
        </label>
        <p className="result-meta">
          {files.length === 1
            ? `${first.pageCount} 頁 · ${formatBytes(totalBytes)}`
            : `${files.length} 個檔案 · ${formatBytes(totalBytes)}`}
        </p>
        <button className="primary-button" onClick={handleSave}>
          {shareable ? '儲存／分享' : '下載檔案'}
        </button>
        {done && <p className="action-hint">已交給系統處理。需要的話可以再按一次。</p>}
        <p className="action-hint">
          檔案在這支手機上產生，沒有上傳到任何地方。離開這個畫面後就不再保留。
        </p>
      </div>

      <div className="action-bar">
        <button className="text-button" onClick={onHome}>
          回到首頁
        </button>
      </div>
    </>
  )
}
