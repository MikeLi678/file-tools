import { LIMITS } from '../limits'

export type StoredSignature = {
  id: string
  /** 透明背景的 PNG */
  blob: Blob
  /** 裁切後的像素尺寸，用來算長寬比 */
  width: number
  height: number
  createdAt: number
}

export type SignatureStore = {
  list(): Promise<StoredSignature[]>
  save(signature: StoredSignature): Promise<void>
  remove(id: string): Promise<void>
  /** IndexedDB 不可用時為 false，此時簽名只在本次 session 有效 */
  readonly persistent: boolean
}

const DB_NAME = 'file-tools'
const STORE_NAME = 'signatures'
const DB_VERSION = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // 無痕模式與封鎖站台資料時，indexedDB 可能不存在或 open 會丟錯
    if (typeof indexedDB === 'undefined') {
      reject(new Error('這個瀏覽器環境沒有 IndexedDB'))
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (error) {
      reject(error)
      return
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('開啟 IndexedDB 失敗'))
    request.onblocked = () => reject(new Error('IndexedDB 被其他分頁鎖住'))
  })
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 操作失敗'))
  })
}

function byNewestFirst(signatures: StoredSignature[]): StoredSignature[] {
  return [...signatures].sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * 擋掉壞掉的紀錄。簽名會跨版本存活在 IndexedDB 裡，
 * width 為 0 的紀錄會讓下游算出 Infinity 的長寬比，
 * 最後把 NaN 座標傳給 pdf-lib，產生一份壞掉的 PDF 而不是報錯。
 */
export function isUsable(signature: StoredSignature): boolean {
  return (
    Number.isFinite(signature.width) &&
    Number.isFinite(signature.height) &&
    signature.width > 0 &&
    signature.height > 0 &&
    signature.blob instanceof Blob &&
    signature.blob.size > 0
  )
}

/** IndexedDB 不可用時的替代品。本次 session 有效，重新開啟就沒了 */
function createMemoryStore(): SignatureStore {
  const items = new Map<string, StoredSignature>()
  return {
    persistent: false,
    async list() {
      return byNewestFirst([...items.values()].filter(isUsable))
    },
    async save(signature) {
      items.set(signature.id, signature)
    },
    async remove(id) {
      items.delete(id)
    },
  }
}

function createIndexedDbStore(db: IDBDatabase): SignatureStore {
  return {
    persistent: true,
    async list() {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const all = await runRequest<StoredSignature[]>(tx.objectStore(STORE_NAME).getAll())
      return byNewestFirst(all.filter(isUsable))
    },
    async save(signature) {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      await runRequest(tx.objectStore(STORE_NAME).put(signature))
    },
    async remove(id) {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      await runRequest(tx.objectStore(STORE_NAME).delete(id))
    },
  }
}

/**
 * 開不起來 IndexedDB 時降級為記憶體版本，而不是讓整個功能不能用。
 * 呼叫端用 persistent 判斷要不要提示「這次關掉就沒了」。
 */
export async function createSignatureStore(): Promise<SignatureStore> {
  try {
    const db = await openDatabase()
    // 存取一次確認真的能用，有些環境 open 會成功但交易會失敗
    const store = createIndexedDbStore(db)
    await store.list()
    return store
  } catch {
    return createMemoryStore()
  }
}

/** 已存滿時不能再存。上限在 limits.ts */
export function canStoreMore(count: number): boolean {
  return count < LIMITS.maxStoredSignatures
}
