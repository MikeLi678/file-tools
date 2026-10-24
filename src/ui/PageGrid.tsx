import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PageTile } from './PageTile'
import type { LoadedPdf, Page } from '../types'
import type { Thumbnailer } from '../core/thumbnailer'

type Props = {
  pages: Page[]
  loadedFiles: Record<string, LoadedPdf>
  thumbnailer: Thumbnailer
  onMove: (from: number, to: number) => void
}

export function PageGrid({ pages, loadedFiles, thumbnailer, onMove }: Props) {
  const sensors = useSensors(
    // 觸控需要延遲門檻，否則單指點擊會被判定成拖曳，
    // 縮圖上的旋轉與刪除按鈕就按不到了。
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = pages.findIndex(p => p.id === active.id)
    const to = pages.findIndex(p => p.id === over.id)
    if (from === -1 || to === -1) return
    onMove(from, to)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={pages.map(p => p.id)} strategy={rectSortingStrategy}>
        <div className="page-grid">
          {pages.map((page, index) => (
            <SortablePageTile
              key={page.id}
              page={page}
              index={index}
              loadedFiles={loadedFiles}
              thumbnailer={thumbnailer}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

type TileProps = {
  page: Page
  index: number
  loadedFiles: Record<string, LoadedPdf>
  thumbnailer: Thumbnailer
}

function SortablePageTile({ page, index, loadedFiles, thumbnailer }: TileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })

  return (
    <PageTile
      page={page}
      index={index}
      loadedFiles={loadedFiles}
      thumbnailer={thumbnailer}
      dragging={isDragging}
      containerRef={setNodeRef}
      containerProps={{
        style: { transform: CSS.Transform.toString(transform), transition },
        ...attributes,
        ...listeners,
      }}
    />
  )
}
