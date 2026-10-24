import { useRef } from 'react'

type Props = {
  onFiles: (files: File[]) => void
  onCamera: () => void
  busy: boolean
}

export function SourceBar({ onFiles, onCamera, busy }: Props) {
  const pdfInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)

  const handle = (input: HTMLInputElement | null) => {
    if (!input?.files) return
    const files = Array.from(input.files)
    // 清掉 value，否則連續選同一個檔案不會觸發 change
    input.value = ''
    if (files.length > 0) onFiles(files)
  }

  return (
    <div className="source-bar">
      <button className="source-button" disabled={busy} onClick={() => pdfInput.current?.click()}>
        加入 PDF
      </button>
      <button className="source-button" disabled={busy} onClick={() => imageInput.current?.click()}>
        加入照片
      </button>
      <button className="source-button" disabled={busy} onClick={onCamera}>
        相機
      </button>
      <input
        ref={pdfInput}
        type="file"
        accept="application/pdf"
        multiple
        hidden
        onChange={() => handle(pdfInput.current)}
      />
      <input
        ref={imageInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={() => handle(imageInput.current)}
      />
    </div>
  )
}
