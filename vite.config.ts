// defineConfig 必須來自 vitest/config，vite 的版本沒有 test 欄位，型別會報錯
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/file-tools/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
