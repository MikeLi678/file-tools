import { useEffect, useRef, useState } from 'react'
import { SourceBar } from './SourceBar'
import { PageGrid } from './PageGrid'
import { ErrorBanner } from './ErrorBanner'
import { loadIncomingFiles } from '../loadFiles'
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
}

export function Editor({ tool, state, dispatch, thumbnailer, onBack, onCamera }: Props) {
  const [busy, setBusy] = useState(false)
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
        />
      )}
    </>
  )
}
