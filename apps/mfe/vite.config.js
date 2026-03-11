import { defineConfig } from 'vite'
import qiankunPlugin from '@meta-ux/plugin'

export default defineConfig({
    server: {
        port: 3002,
        /**
         * Allow the host app's origin to proxy requests to this dev server.
         * Vite 5+ needs this when the host is on a different port.
         */
        cors: true,
    },

    build: {
        /**
         * Vanilla apps don't have a framework entry — point Vite at your main.ts/js.
         * Vite resolves this relative to the project root.
         */
        rollupOptions: {
            input: 'index.html',
            treeshake: false,
        },
        /**
         * Emit a manifest so the host app can reference hashed asset filenames
         * if needed (optional but useful for SSR hosts).
         */
        manifest: true,
        outDir: 'dist',
    },

    plugins: [
        qiankunPlugin({
            /**
             * name: the key Qiankun uses to look up this app's lifecycles on window.
             *
             * This must match the `name` field in the host's registerMicroApps() call:
             *   registerMicroApps([{ name: 'cart-app', entry: '//localhost:3002', ... }])
             *
             * It is completely independent of `base` above.
             */
            name: 'cart-app',
            dev: {
                enabled: true,
                port: 3002,
                /**
                 * List every origin that will load this micro-app during development.
                 * Typically just your host app's dev server URL.
                 */
                allowedOrigins: ['http://localhost:8080'],
            },
            assets: {
                scriptStrategy: 'dynamic-import',
            },
            communication: {
                enableEventBus: true,
                injectProps: true,
            },
            css: {
                isolation: 'scoped',
                injectReset: true,
            },
            hooks: {
                beforeMount: (props) => {
                    console.log('[cart-app] mounting with props:', props)
                },
                afterUnmount: () => {
                    // Clean up anything vanilla JS can't garbage collect on its own:
                    // event listeners, timers, third-party widget instances, etc.
                    console.log('[cart-app] unmounted — run your cleanup here')
                },
            },
        }),
    ],
})
