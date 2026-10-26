import { useEffect, useRef, useState } from 'react'
import { SourceBar } from './SourceBar'
import { PageGrid } from './PageGrid'
import { ErrorBanner } from './ErrorBanner'
import { ActionBar } from './ActionBar'
import { loadIncomingFiles } from '../loadFiles'
import { SignatureCapture } from './SignatureCapture'
import { SignatureLibrary } from './SignatureLibrary'
import { SignaturePlacer } from './SignaturePlacer'
import { exportToPdf, type SignatureAsset } from '../core/exporter'
import { createSignatureStore, type SignatureStore, type StoredSignature } from '../core/signature/store'
import { outputFileName, renderImageToJpeg, type ExportedFile } from '../core/output'
import { pagesToJpegBlobs, type ImageExportProgress } from '../core/pageToImage'
import { LIMITS } from '../core/limits'
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
  onExported: (files: ExportedFile[]) => void
}

export function Editor({ tool, state, dispatch, thumbnailer, onBack, onCamera, onExported }: Props) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<ImageExportProgress | null>(null)
  const [store, setStore] = useState<SignatureStore | null>(null)
  const [signatures, setSignatures] = useState<StoredSignature[]>([])
  // null = 沒在簽名流程；library = 挑選；capture = 手寫；place = 定位
  const [signFlow, setSignFlow] = useState<
    | null
    | { step: 'library'; pageId: string }
    | { step: 'capture'; pageId: string }
    | { step: 'place'; pageId: string; signature: StoredSignature }
  >(null)
  // 使用者在載入途中離開編輯器時，進行中的 promise 不能再 dispatch，
  // 否則會把上一次的頁面寫進已重置的 state。
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    createSignatureStore().then(async created => {
      if (cancelled) return
      setStore(created)
      const list = await created.list()
      if (!cancelled) setSignatures(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const signaturesById: Record<string, StoredSignature> = Object.fromEntries(
    signatures.map(s => [s.id, s]),
  )

  // 只轉換實際被用到的簽名，不必每次匯出都把庫裡全部讀成位元組
  const signatureAssets = async (pages: typeof state.pages): Promise<Record<string, SignatureAsset>> => {
    const used = new Set(pages.flatMap(p => p.overlays).map(o => o.signatureId))
    const out: Record<string, SignatureAsset> = {}
    for (const stored of signatures) {
      if (!used.has(stored.id)) continue
      out[stored.id] = {
        id: stored.id,
        bytes: new Uint8Array(await stored.blob.arrayBuffer()),
        width: stored.width,
        height: stored.height,
      }
    }
    return out
  }

  const refreshSignatures = async () => {
    if (!store) return
    const list = await store.list()
    if (mounted.current) setSignatures(list)
  }

  const handleDeleteSignature = async (id: string) => {
    if (!store) return
    await store.remove(id)
    // 連帶移除所有引用它的覆蓋層，否則匯出時會靜默跳過，使用者不知道簽名為何不見
    for (const page of state.pages) {
      for (const overlay of page.overlays) {
        if (overlay.signatureId === id) {
          dispatch({ type: 'removeOverlay', pageId: page.id, overlayId: overlay.id })
        }
      }
    }
    await refreshSignatures()
  }

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
    setProgress({ done: 0, total: 1 })
    try {
      // 必須先取出成變數，直接寫 pages[0].source.blob 不會被 TS 窄化
      const single = pages.length === 1 ? pages[0] : null
      if (format === 'jpg' && single && single.source.kind === 'image') {
        const blob = await renderImageToJpeg(single.source.blob, single.rotation)
        if (!mounted.current) return
        onExported([{ blob, fileName: outputFileName(new Date(), 'jpg'), pageCount: 1 }])
        return
      }
      const bytes = await exportToPdf({ pages, loadedFiles: state.loadedFiles, signatures: await signatureAssets(pages) })
      // pdf-lib 的 save() 實際回傳一般 ArrayBuffer，但型別標成 ArrayBufferLike
      // （理論上可能是 SharedArrayBuffer），直接傳給 Blob 會型別不符。
      // 用斷言而不是 new Uint8Array(bytes)，後者會把整份 PDF 再複製一次。
      const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })
      if (!mounted.current) return
      onExported([{ blob, fileName: outputFileName(new Date(), 'pdf'), pageCount: pages.length }])
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '匯出失敗')
    } finally {
      if (mounted.current) setProgress(null)
    }
  }

  const handleExportImages = async () => {
    const pages = state.pages.filter(p => p.selected)
    if (pages.length === 0) return

    if (pages.length > LIMITS.maxImageExportPages) {
      dispatch({
        type: 'load',
        pages: [],
        files: [],
        errors: [{ fileName: `${pages.length} 頁`, reason: 'limit-image-pages' }],
      })
      return
    }

    setProgress({ done: 0, total: pages.length })
    try {
      const blobs = await pagesToJpegBlobs({
        pages,
        loadedFiles: state.loadedFiles,
        signatures: signaturesById,
        onProgress: setProgress,
      })
      if (!mounted.current) return
      const now = new Date()
      onExported(
        blobs.map((blob, index) => ({
          blob,
          fileName: outputFileName(now, 'jpg', blobs.length === 1 ? undefined : index + 1),
          pageCount: 1,
        })),
      )
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '轉換失敗')
    } finally {
      if (mounted.current) setProgress(null)
    }
  }

  if (signFlow) {
    if (signFlow.step === 'capture') {
      return (
        <SignatureCapture
          onCancel={() => setSignFlow({ step: 'library', pageId: signFlow.pageId })}
          onSaved={async signature => {
            await store?.save(signature)
            await refreshSignatures()
            if (mounted.current) setSignFlow({ step: 'place', pageId: signFlow.pageId, signature })
          }}
        />
      )
    }
    if (signFlow.step === 'library') {
      return (
        <SignatureLibrary
          signatures={signatures}
          persistent={store?.persistent ?? true}
          onPick={signature => setSignFlow({ step: 'place', pageId: signFlow.pageId, signature })}
          onDelete={handleDeleteSignature}
          onNew={() => setSignFlow({ step: 'capture', pageId: signFlow.pageId })}
          onCancel={() => setSignFlow(null)}
        />
      )
    }
    const pageIndex = state.pages.findIndex(p => p.id === signFlow.pageId)
    const page = state.pages[pageIndex]
    if (page) {
      return (
        <SignaturePlacer
          page={page}
          pageIndex={pageIndex}
          loadedFiles={state.loadedFiles}
          signature={signFlow.signature}
          signatures={signaturesById}
          onAdd={overlay => dispatch({ type: 'addOverlay', pageId: page.id, overlay })}
          onUpdate={(overlayId, patch) => dispatch({ type: 'updateOverlay', pageId: page.id, overlayId, patch })}
          onRemove={overlayId => dispatch({ type: 'removeOverlay', pageId: page.id, overlayId })}
          onDone={() => setSignFlow(null)}
        />
      )
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
          onSign={pageId => setSignFlow({ step: 'library', pageId })}
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
          onRemoveSelected={() => dispatch({ type: 'removeSelected' })}
          onExport={() => handleExport('pdf')}
          progress={progress}
          primaryExport={tool.primaryExport}
          onExportImages={handleExportImages}
          jpegAvailable={jpegAvailable}
          onExportJpeg={() => handleExport('jpg')}
        />
      )}
    </>
  )
}
