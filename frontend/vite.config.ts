import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      // Forward all /api/* calls to the FastAPI backend on port 8001.
      // This avoids CORS issues and lets the frontend use relative URLs.
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    // Force a single copy of React across all packages (including ag-grid-react).
    // Without this, ag-grid-react can resolve to its own bundled React, causing
    // the "Cannot read properties of null (reading 'useContext')" crash.
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom'),
    },
  },
})
