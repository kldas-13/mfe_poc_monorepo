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
    // origin: tells Vite what absolute URL to embed in <script src> inside
    // the HTML it serves. Without this, scripts resolve against the shell's
    // origin (:5173) and 404. This is the #1 cause of blank canvas.
    origin: 'http://localhost:5174',
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  },


  optimizeDeps: {
    include: ['graphology', 'graphology-layout/circular', 'graphology-layout-forceatlas2', 'sigma'],
    esbuildOptions: { target: 'esnext' },
  },
}))
