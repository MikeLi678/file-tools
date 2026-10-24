import { registerSW } from 'virtual:pwa-register'

export function registerServiceWorker(): void {
  // 開發模式不註冊，避免快取干擾 HMR
  if (import.meta.env.DEV) return
  registerSW({ immediate: true })
}
