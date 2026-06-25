import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'

// API calls go straight to the n8n webhook URLs (VITE_N8N_* env vars),
// so no dev proxy is needed. Two HTML entries: the kiosk (index.html) and
// the QR gift page (gift.html).
export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        gift: resolve(__dirname, 'gift.html'),
      },
    },
  },
})
