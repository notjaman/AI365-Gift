import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// API calls go straight to the n8n webhook URLs (VITE_N8N_* env vars),
// so no dev proxy is needed.
export default defineConfig({
  plugins: [vue()],
})
