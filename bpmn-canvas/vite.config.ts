import { defineConfig } from 'vite'
import qiankun from 'vite-plugin-qiankun'

export default defineConfig(() => ({
  base: '/',

  plugins: [
    qiankun('bpmn-canvas', { useDevMode: true }),
  ],

  server: {
    port: 5175,
    host: '0.0.0.0',
    origin: 'http://localhost:5175',
    cors: true,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  },

  build: {
    target:       'esnext',
    minify:       false,
    cssCodeSplit: false,
    rollupOptions: { treeshake: false },
  },

  optimizeDeps: {
    include: ['bpmn-js', 'qiankun', 'import-html-entry'],
    esbuildOptions: { target: 'esnext' },
  },

}))
