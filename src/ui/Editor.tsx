import { useEffect, useRef, useState } from 'react'
import { SourceBar } from './SourceBar'
import { PageGrid } from './PageGrid'
import { ErrorBanner } from './ErrorBanner'
import { ActionBar } from './ActionBar'
import { loadIncomingFiles } from '../loadFiles'
import { exportToPdf } from '../core/exporter'
import { outputFileName, type ExportedFile } from '../core/output'
import type { DocumentState } from '../types'
import type { DocumentAction } from '../state/documentReducer'
import type { ToolDefinition } from '../tools'
import type { Thumbnailer } from '../core/thumbnailer'

type Props = {
  tool: ToolDefinition
  state: DocumentState
  dispatch: (action: DocumentAction) => void
  thumbnailer: Thumbnailer
  onBack: () => void
  onCamera: () => void
  onExported: (file: ExportedFile) => void
}

export function Editor({ tool, state, dispatch, thumbnailer, onBack, onCamera, onExported }: Props) {
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  // 使用者在載入途中離開編輯器時，進行中的 promise 不能再 dispatch，
  // 否則會把上一次的頁面寫進已重置的 state。
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const handleFiles = async (files: File[]) => {
    setBusy(true)
    try {
      const action = await loadIncomingFiles(files, state)
      if (mounted.current) dispatch(action)
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  // 勾選模式下只匯出勾選的頁；非勾選模式一律匯出全部，不看 selected 欄位
  const exportPages = state.selectMode ? state.pages.filter(p => p.selected) : state.pages

  // 只有一張影像頁時，JPEG 是「額外的」選項而不是替代品——
  // 想把單張掃描包成 PDF 的人仍然按得到匯出 PDF
  const jpegAvailable = exportPages.length === 1 && exportPages[0].source.kind === 'image'

  const handleExport = async (format: 'pdf' | 'jpg' = 'pdf') => {
    const pages = exportPages
    if (pages.length === 0) return
    setExporting(true)
    try {
      // 必須先取出成變數，直接寫 pages[0].source.blob 不會被 TS 窄化
      const single = pages.length === 1 ? pages[0] : null
      if (format === 'jpg' && single && single.source.kind === 'image') {
        onExported({ blob: single.source.blob, fileName: outputFileName(new Date(), 'jpg'), pageCount: 1 })
        return
      }
      const bytes = await exportToPdf({ pages, loadedFiles: state.loadedFiles })
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
      onExported({ blob, fileName: outputFileName(new Date(), 'pdf'), pageCount: pages.length })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '匯出失敗')
    } finally {
      if (mounted.current) setExporting(false)
    }
  }

  return (
    <>
      <header className="editor-header">
        <button className="back-button" onClick={onBack} aria-label="返回首頁">
          返回
        </button>
        <h1>{tool.title}</h1>
        <span className="count">{state.pages.length} 頁</span>
      </header>

      <SourceBar onFiles={handleFiles} onCamera={onCamera} busy={busy} />
      <ErrorBanner errors={state.errors} onDismiss={() => dispatch({ type: 'dismissErrors' })} />

      {state.pages.length === 0 ? (
        <p className="empty-state">還沒有頁面。用上方的按鈕加入 PDF、照片或掃描。</p>
      ) : (
        <PageGrid
          pages={state.pages}
          loadedFiles={state.loadedFiles}
          thumbnailer={thumbnailer}
          onMove={(from, to) => dispatch({ type: 'move', from, to })}
          onRotate={pageId => dispatch({ type: 'rotate', pageId })}
          onRemove={pageId => dispatch({ type: 'remove', pageId })}
          selectMode={state.selectMode}
          onToggleSelect={pageId => dispatch({ type: 'toggleSelect', pageId })}
        />
      )}

      {state.pages.length > 0 && (
        <ActionBar
          selectMode={state.selectMode}
          totalPages={state.pages.length}
          selectedCount={state.pages.filter(p => p.selected).length}
          onToggleMode={on => dispatch({ type: 'setSelectMode', on })}
          onInvert={() => dispatch({ type: 'invertSelection' })}
          onExport={() => handleExport('pdf')}
          exporting={exporting}
          jpegAvailable={jpegAvailable}
          onExportJpeg={() => handleExport('jpg')}
        />
      )}
    </>
  )
}
