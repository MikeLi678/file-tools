import { PageTile } from './PageTile'
import type { LoadedPdf, Page } from '../types'
import type { Thumbnailer } from '../core/thumbnailer'

type Props = {
  pages: Page[]
  loadedFiles: Record<string, LoadedPdf>
  thumbnailer: Thumbnailer
}

export function PageGrid({ pages, loadedFiles, thumbnailer }: Props) {
  return (
    <div className="page-grid">
      {pages.map((page, index) => (
        <PageTile
          key={page.id}
          page={page}
          index={index}
          loadedFiles={loadedFiles}
          thumbnailer={thumbnailer}
        />
      ))}
    </div>
  )
}
