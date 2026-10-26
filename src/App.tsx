import { useMemo, useReducer, useState } from 'react'
import { Home } from './ui/Home'
import { Editor } from './ui/Editor'
import { ExportResult } from './ui/ExportResult'
import { ScannerView } from './ui/ScannerView'
import { newId } from './ids'
import { documentReducer, initialDocumentState, totalLoadedBytes } from './state/documentReducer'
import { checkLimits } from './core/limits'
import { createThumbnailer } from './core/thumbnailer'
import { findTool, type ToolId } from './tools'
import type { ExportedFile } from './core/output'

type View =
  | { name: 'home' }
  | { name: 'editor'; tool: ToolId }
  | { name: 'result'; tool: ToolId; files: ExportedFile[] }
  | { name: 'scanner'; tool: ToolId }

export function App() {
  const [view, setView] = useState<View>({ name: 'home' })
  const [state, dispatch] = useReducer(documentReducer, initialDocumentState)
  const thumbnailer = useMemo(() => createThumbnailer(), [])

  // 所有會重置文件的路徑都走這裡，確保縮圖的 blob URL 一併釋放
  const resetDocument = () => {
    thumbnailer.clear()
    dispatch({ type: 'reset' })
  }

  const openTool = (id: ToolId) => {
    resetDocument()
    dispatch({ type: 'setSelectMode', on: findTool(id).initialSelectMode })
    setView(id === 'scan' ? { name: 'scanner', tool: id } : { name: 'editor', tool: id })
  }

  const goHome = () => {
    resetDocument()
    setView({ name: 'home' })
  }

  if (view.name === 'home') {
    return (
      <div className="app">
        <Home onPick={openTool} />
      </div>
    )
  }

  if (view.name === 'result') {
    return (
      <div className="app">
        <ExportResult
          files={view.files}
          onBackToEditor={() => setView({ name: 'editor', tool: view.tool })}
          onHome={goHome}
        />
      </div>
    )
  }

  if (view.name === 'scanner') {
    return (
      <div className="app">
        <ScannerView
          onCaptured={blob => {
            // 掃描也要走同一套上限，否則相機可以無限往 pages 推
            const check = checkLimits({
              currentPageCount: state.pages.length,
              currentTotalBytes: totalLoadedBytes(state),
              incoming: [{ fileName: '掃描頁', bytes: blob.size, pageCount: 1 }],
            })
            dispatch({
              type: 'load',
              pages: check.accepted.length
                ? [{ id: newId(), source: { kind: 'image', blob }, rotation: 0, selected: false }]
                : [],
              files: [],
              errors: check.rejected,
            })
            setView({ name: 'editor', tool: view.tool })
          }}
          onCancel={() => setView({ name: 'editor', tool: view.tool })}
        />
      </div>
    )
  }

  return (
    <div className="app">
      <Editor
        tool={findTool(view.tool)}
        state={state}
        dispatch={dispatch}
        thumbnailer={thumbnailer}
        onBack={goHome}
        onCamera={() => setView({ name: 'scanner', tool: view.tool })}
        onExported={files => setView({ name: 'result', tool: view.tool, files })}
      />
    </div>
  )
}
