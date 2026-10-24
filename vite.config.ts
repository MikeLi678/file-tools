// defineConfig 必須來自 vitest/config，vite 的版本沒有 test 欄位，型別會報錯
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/file-tools/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
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
        theme_color: '#18181b',
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
        // pdf.js 的 worker 加上字型檔，單檔會超過預設的 2 MiB 上限
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
