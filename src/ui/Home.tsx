import { TOOLS, type ToolId } from '../tools'

type Props = {
  onPick: (id: ToolId) => void
}

export function Home({ onPick }: Props) {
  return (
    <>
      <h1 className="screen-title">檔案工具</h1>
      <div className="tool-grid">
        {TOOLS.map(tool => (
          <button key={tool.id} className="tool-card" onClick={() => onPick(tool.id)}>
            <strong>{tool.title}</strong>
            <span>{tool.hint}</span>
          </button>
        ))}
      </div>
      <p className="empty-state">
        所有處理都在這支手機上完成，檔案不會上傳到任何伺服器。
      </p>
    </>
  )
}
