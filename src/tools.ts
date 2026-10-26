export type ToolId = 'merge' | 'split' | 'images' | 'scan' | 'toImages' | 'sign'

export type ToolDefinition = {
  id: ToolId
  title: string
  hint: string
  /** 進入編輯器後是否預設啟用勾選模式 */
  initialSelectMode: boolean
  /** 匯出列的主按鈕做什麼。另一種會以次要按鈕出現 */
  primaryExport: 'pdf' | 'images'
}

export const TOOLS: ToolDefinition[] = [
  { id: 'merge', title: '合併 PDF', hint: '把多份 PDF 接成一份', initialSelectMode: false, primaryExport: 'pdf' },
  { id: 'split', title: '分割抽頁', hint: '挑出要的頁面另存', initialSelectMode: true, primaryExport: 'pdf' },
  { id: 'images', title: '圖片轉 PDF', hint: '照片或截圖轉成 PDF', initialSelectMode: false, primaryExport: 'pdf' },
  { id: 'scan', title: '掃描文件', hint: '用相機拍成 PDF', initialSelectMode: false, primaryExport: 'pdf' },
  { id: 'toImages', title: 'PDF 轉圖片', hint: '挑出頁面轉成 JPEG', initialSelectMode: true, primaryExport: 'images' },
  { id: 'sign', title: '簽署文件', hint: '手寫簽名蓋到 PDF 上', initialSelectMode: false, primaryExport: 'pdf' },
]

export function findTool(id: ToolId): ToolDefinition {
  const tool = TOOLS.find(t => t.id === id)
  if (!tool) throw new Error(`未知的工具：${id}`)
  return tool
}
