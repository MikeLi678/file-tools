import type { DocumentState } from '../types'
import type { ToolDefinition } from '../tools'

type Props = {
  tool: ToolDefinition
  state: DocumentState
  onBack: () => void
}

export function Editor({ tool, state, onBack }: Props) {
  return (
    <>
      <header className="editor-header">
        <button className="back-button" onClick={onBack} aria-label="返回首頁">
          返回
        </button>
        <h1>{tool.title}</h1>
        <span className="count">{state.pages.length} 頁</span>
      </header>
      {state.pages.length === 0 && (
        <p className="empty-state">還沒有頁面。用上方的按鈕加入 PDF、照片或掃描。</p>
      )}
    </>
  )
}
