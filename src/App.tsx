import { useReducer, useState } from 'react'
import { Home } from './ui/Home'
import { Editor } from './ui/Editor'
import { documentReducer, initialDocumentState } from './state/documentReducer'
import { findTool, type ToolId } from './tools'

type View = { name: 'home' } | { name: 'editor'; tool: ToolId }

export function App() {
  const [view, setView] = useState<View>({ name: 'home' })
  const [state, dispatch] = useReducer(documentReducer, initialDocumentState)

  const openTool = (id: ToolId) => {
    dispatch({ type: 'reset' })
    dispatch({ type: 'setSelectMode', on: findTool(id).initialSelectMode })
    setView({ name: 'editor', tool: id })
  }

  const goHome = () => {
    dispatch({ type: 'reset' })
    setView({ name: 'home' })
  }

  return (
    <div className="app">
      {view.name === 'home' ? (
        <Home onPick={openTool} />
      ) : (
        <Editor tool={findTool(view.tool)} state={state} onBack={goHome} />
      )}
    </div>
  )
}
