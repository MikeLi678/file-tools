export type ToolId = 'merge' | 'split' | 'images' | 'scan'

export type ToolDefinition = {
  id: ToolId
  title: string
  hint: string
  /** 進入編輯器後是否預設啟用勾選模式 */
  initialSelectMode: boolean
}

export const TOOLS: ToolDefinition[] = [
  { id: 'merge', title: '合併 PDF', hint: '把多份 PDF 接成一份', initialSelectMode: false },
  { id: 'split', title: '分割抽頁', hint: '挑出要的頁面另存', initialSelectMode: true },
  { id: 'images', title: '圖片轉 PDF', hint: '照片或截圖轉成 PDF', initialSelectMode: false },
  { id: 'scan', title: '掃描文件', hint: '用相機拍成 PDF', initialSelectMode: false },
]

export function findTool(id: ToolId): ToolDefinition {
  const tool = TOOLS.find(t => t.id === id)
  if (!tool) throw new Error(`未知的工具：${id}`)
  return tool
}
