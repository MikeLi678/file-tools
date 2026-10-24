import { useEffect, useState, type HTMLAttributes, type Ref } from 'react'
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
}

export function PageTile({
  page,
  index,
  loadedFiles,
  thumbnailer,
  dragging = false,
  containerRef,
  containerProps,
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

  return (
    <div
      ref={containerRef}
      className={dragging ? 'page-tile dragging' : 'page-tile'}
      data-testid="page-tile"
      data-page-index={index}
      {...containerProps}
    >
      <div className="page-thumb">
        {url && <img src={url} alt={`第 ${index + 1} 頁`} draggable={false} />}
        {!url && !failed && <span className="thumb-placeholder">載入中</span>}
        {failed && <span className="thumb-placeholder">縮圖失敗</span>}
      </div>
      <span className="page-number">{index + 1}</span>
    </div>
  )
}
