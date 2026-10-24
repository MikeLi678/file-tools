import { useMemo, useReducer, useState } from 'react'
import { Home } from './ui/Home'
import { Editor } from './ui/Editor'
import { ExportResult } from './ui/ExportResult'
import { documentReducer, initialDocumentState } from './state/documentReducer'
import { createThumbnailer } from './core/thumbnailer'
import { findTool, type ToolId } from './tools'
import type { ExportedFile } from './core/output'

type View =
  | { name: 'home' }
  | { name: 'editor'; tool: ToolId }
  | { name: 'result'; tool: ToolId; file: ExportedFile }

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
    setView({ name: 'editor', tool: id })
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
          file={view.file}
          onBackToEditor={() => setView({ name: 'editor', tool: view.tool })}
          onHome={goHome}
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
        onCamera={() => window.alert('相機在後續的 task 實作')}
        onExported={file => setView({ name: 'result', tool: view.tool, file })}
      />
    </div>
  )
}
