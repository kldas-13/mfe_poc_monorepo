import { defineConfig } from 'vite'

export default defineConfig({
    base: '/',

    server: {
        port: 8080,

        headers: {
            // Shell also needs COEP so the browser allows it to load resources
            // (including worker scripts) from the child's cross-origin dev server.
            // Without this the shell document itself will block the child's worker.
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Access-Control-Allow-Origin': '*',
        },
    },

    build: {
        outDir: 'dist',
    },
})
