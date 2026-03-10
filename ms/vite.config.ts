import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    host: '0.0.0.0',
    cors: true,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
    proxy: {
        '/api': 'http://localhost:3000',
    '/ws':  { target: 'ws://localhost:3000', ws: true },
    }
  },
  optimizeDeps: {
    include: [
      'qiankun',
      'import-html-entry',
    ],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  build: {
    target: 'esnext',
  },
})