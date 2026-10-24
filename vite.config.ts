// defineConfig 必須來自 vitest/config，vite 的版本沒有 test 欄位，型別會報錯
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/file-tools/',
  plugins: [
    react(),
    VitePWA({
      // 用 prompt 而不是 autoUpdate。autoUpdate 會在新版 service worker 啟用的瞬間
      // 無提示地 location.reload()，而這個 app 的狀態全在記憶體、刻意不留存——
      // 使用者載入到一半的頁面會直接消失。prompt 模式下新版會等到所有分頁都關閉
      // 才啟用，使用者下次打開就是新版，不會在操作到一半時被打斷。
      registerType: 'prompt',
      // manifest 的路徑必須與 base 一致，否則加到主畫面後會開錯路徑
      manifest: {
        name: '檔案工具',
        short_name: '檔案工具',
        description: 'PDF 合併、圖片轉 PDF、相機掃描，全部在手機本機完成',
        lang: 'zh-Hant',
        start_url: '/file-tools/',
        scope: '/file-tools/',
        display: 'standalone',
        background_color: '#fafafa',
        theme_color: '#fafafa',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // mjs 必須列入，pdf.js 的 worker 是 .mjs。
        // 漏掉它離線時縮圖會整批失敗，而且錯誤不明顯。
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,woff2}'],
        // 保留餘裕。目前最大單檔是 pdf.js 的 worker，約 1.3 MiB，仍低於 Workbox
        // 預設的 2 MiB 上限，但日後升級 pdf.js 可能逼近，先放寬避免靜默不被快取。
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: '/file-tools/index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
