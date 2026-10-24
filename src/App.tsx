import { useMemo, useReducer, useState } from 'react'
import { Home } from './ui/Home'
import { Editor } from './ui/Editor'
import { documentReducer, initialDocumentState } from './state/documentReducer'
import { createThumbnailer } from './core/thumbnailer'
import { findTool, type ToolId } from './tools'

type View = { name: 'home' } | { name: 'editor'; tool: ToolId }

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

  return (
    <div className="app">
      {view.name === 'home' ? (
        <Home onPick={openTool} />
      ) : (
        <Editor
          tool={findTool(view.tool)}
          state={state}
          dispatch={dispatch}
          thumbnailer={thumbnailer}
          onBack={goHome}
          onCamera={() => window.alert('相機在後續的 task 實作')}
        />
      )}
    </div>
  )
}
