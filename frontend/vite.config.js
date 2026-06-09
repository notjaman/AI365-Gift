import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Dev server proxies API calls to the FastAPI backend on :8000.
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/check': 'http://localhost:8000',
      '/draw': 'http://localhost:8000',
      '/stock': 'http://localhost:8000',
    },
  },
})
