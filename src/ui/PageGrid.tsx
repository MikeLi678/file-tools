import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PageTile } from './PageTile'
import type { LoadedPdf, Page } from '../types'
import type { Thumbnailer } from '../core/thumbnailer'

type Props = {
  pages: Page[]
  loadedFiles: Record<string, LoadedPdf>
  thumbnailer: Thumbnailer
  onMove: (from: number, to: number) => void
  onRotate: (pageId: string) => void
  onRemove: (pageId: string) => void
}

export function PageGrid({ pages, loadedFiles, thumbnailer, onMove, onRotate, onRemove }: Props) {
  const sensors = useSensors(
    // 觸控需要延遲門檻，否則單指點擊會被判定成拖曳，
    // 縮圖上的旋轉與刪除按鈕就按不到了。
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    // 用 MouseSensor 而不是 PointerSensor。PointerSensor 在觸控裝置上一樣會收到
    // pointerdown，手指按住 50ms 再橫向移動就繞過上面的 200ms 門檻直接開始拖曳，
    // 讓縮圖上的按鈕永遠按不到（已用 hasTouch 的瀏覽器 context 實測確認）。
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // 根 div 帶著 dnd-kit 的 role="button" 與 tabIndex=0。沒有 KeyboardSensor 的話
    // 它可聚焦卻無作用，而 aria-describedby 還會告訴螢幕閱讀器「按空白鍵拿起項目」。
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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
              onRotate={onRotate}
              onRemove={onRemove}
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
  onRotate: (pageId: string) => void
  onRemove: (pageId: string) => void
}

function SortablePageTile({ page, index, loadedFiles, thumbnailer, onRotate, onRemove }: TileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })

  return (
    <PageTile
      page={page}
      index={index}
      loadedFiles={loadedFiles}
      thumbnailer={thumbnailer}
      onRotate={onRotate}
      onRemove={onRemove}
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
