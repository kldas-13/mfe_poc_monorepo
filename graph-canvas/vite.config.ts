import { defineConfig } from 'vite'
import qiankun from 'vite-plugin-qiankun'

export default defineConfig(() => ({
  base: '/',

  plugins: [
    qiankun('graph-canvas', { useDevMode: true }),
  ],

  server: {
    port: 5174,
    host: '0.0.0.0',
    origin: 'http://localhost:5174',
    cors: true,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  },

  optimizeDeps: {
  include: ['qiankun', 'import-html-entry'],
},

  build: {
    target:       'esnext',
    minify:       false,
    cssCodeSplit: false,
    rollupOptions: { treeshake: false },
  },
}))
