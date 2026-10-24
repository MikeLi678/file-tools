import { useState } from 'react'
import { canShareFiles, formatBytes, shareFile, type ExportedFile } from '../core/output'

type Props = {
  file: ExportedFile
  onBackToEditor: () => void
  onHome: () => void
}

export function ExportResult({ file, onBackToEditor, onHome }: Props) {
  const [done, setDone] = useState(false)
  const shareable = canShareFiles(file)

  // 不要 await 後才呼叫 shareFile——它內部需要同步進入 navigator.share
  const handleSave = () => {
    shareFile(file)
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
        <p className="result-name">{file.fileName}</p>
        <p className="result-meta">
          {file.pageCount} 頁 · {formatBytes(file.blob.size)}
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
