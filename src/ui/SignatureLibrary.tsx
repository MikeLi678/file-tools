import { useEffect, useState } from 'react'
import { LIMITS } from '../core/limits'
import { canStoreMore } from '../core/signature/store'
import type { StoredSignature } from '../core/signature/store'

type Props = {
  signatures: StoredSignature[]
  persistent: boolean
  onPick: (signature: StoredSignature) => void
  onDelete: (id: string) => void
  onNew: () => void
  onCancel: () => void
}

export function SignatureLibrary({ signatures, persistent, onPick, onDelete, onNew, onCancel }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({})

  // 每個簽名要一個 object URL 才能顯示，離開時要收回
  useEffect(() => {
    const created: Record<string, string> = {}
    for (const signature of signatures) {
      created[signature.id] = URL.createObjectURL(signature.blob)
    }
    setUrls(created)
    return () => {
      for (const url of Object.values(created)) URL.revokeObjectURL(url)
    }
  }, [signatures])

  return (
    <div className="signature-library">
      <header className="editor-header">
        <button className="back-button" onClick={onCancel}>
          返回
        </button>
        <h1>選擇簽名</h1>
      </header>

      {!persistent && (
        <p className="action-hint" role="status">
          這個瀏覽器無法儲存資料，簽名只在這次使用期間有效，關掉就會消失。
        </p>
      )}

      {signatures.length === 0 ? (
        <p className="action-hint">還沒有簽名。按下面的按鈕簽一個。</p>
      ) : (
        <ul className="signature-list">
          {signatures.map(signature => (
            <li key={signature.id} className="signature-item">
              <button className="signature-pick" onClick={() => onPick(signature)}>
                {urls[signature.id] && <img src={urls[signature.id]} alt="簽名" />}
              </button>
              <button className="text-button danger" onClick={() => onDelete(signature.id)}>
                刪除
              </button>
            </li>
          ))}
        </ul>
      )}

      <button className="primary-button" onClick={onNew} disabled={!canStoreMore(signatures.length)}>
        簽一個新的
      </button>
      {!canStoreMore(signatures.length) && (
        <p className="action-hint">
          最多存 {LIMITS.maxStoredSignatures} 個簽名。要再簽就先刪掉一個。
        </p>
      )}
    </div>
  )
}
