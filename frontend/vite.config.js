import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:7860',
        changeOrigin: true,
        // Silence ECONNREFUSED noise in the terminal — the browser receives a 503
        // which the frontend already handles gracefully with its own error UI.
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            if (err.code === 'ECONNREFUSED') {
              // Backend is not up yet — return a clean JSON error instead of crashing
              if (res && !res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ error: 'Backend not available. Please start the Flask server (python app_api.py).' }))
              }
            }
          })
        },
      },
    },
  },
  build: {
    outDir: '../static_react',
    emptyOutDir: true,
  },
})
