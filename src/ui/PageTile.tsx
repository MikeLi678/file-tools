import { useEffect, useState } from 'react'
import type { LoadedPdf, Page } from '../types'
import type { Thumbnailer } from '../core/thumbnailer'

type Props = {
  page: Page
  index: number
  loadedFiles: Record<string, LoadedPdf>
  thumbnailer: Thumbnailer
}

export function PageTile({ page, index, loadedFiles, thumbnailer }: Props) {
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

  return (
    <div className="page-tile">
      <div className="page-thumb">
        {url && !failed && <img src={url} alt={`第 ${index + 1} 頁`} />}
        {!url && !failed && <span className="thumb-placeholder">載入中</span>}
        {failed && <span className="thumb-placeholder">縮圖失敗</span>}
      </div>
      <span className="page-number">{index + 1}</span>
    </div>
  )
}
