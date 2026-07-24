import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiTarget = 'http://127.0.0.1:8787'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        // dev の Vite プロキシ経由だと Origin が web(5173) のままになり、Worker 側の
        // CSRF 保護(same-origin 判定)に弾かれる。本番は web/api 同一 origin のため
        // 問題にならないが、dev では Origin を api の origin に揃えて POST 等を通す。
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('origin', apiTarget)
          })
        },
      },
    },
  },
})
