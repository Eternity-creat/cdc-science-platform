import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const SERVER_TARGET = process.env.VITE_DEV_PROXY_TARGET || 'http://175.24.166.46:8888'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/agent': {
        target: SERVER_TARGET,
        changeOrigin: true,
      },
      '/api/skill': {
        target: SERVER_TARGET,
        changeOrigin: true,
      },
      '/uploads': {
        target: SERVER_TARGET,
        changeOrigin: true,
      },
      '/api': {
        target: SERVER_TARGET,
        changeOrigin: true,
      },
    },
  },
})
