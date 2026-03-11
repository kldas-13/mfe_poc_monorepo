import type { PluginOption } from 'vite'
import { MicroAppConfig, QiankunPluginFn } from './types'
import { registerDevMiddleware } from './middlewares/dev.middleware'
import { transformHtml } from './transforms'

export { MicroAppConfig } from './types'

/**
 * Vite plugin that adapts a Vite app to run as a Qiankun micro-frontend.
 *
 * @example
 * // vite.config.ts
 * import qiankunPlugin from './plugins/qiankun'
 *
 * export default defineConfig({
 *   plugins: [
 *     vue(),
 *     qiankunPlugin({
 *       name: 'my-micro-app',
 *       dev: { enabled: true, port: 3001, allowedOrigins: ['http://localhost:8080'] },
 *       communication: { enableEventBus: true, injectProps: true },
 *       css: { isolation: 'scoped', injectReset: true },
 *       hooks: {
 *         beforeMount: (props) => console.log('mounting', props),
 *         afterUnmount: () => console.log('unmounted'),
 *       },
 *     }),
 *   ],
 * })
 */
const qiankunPlugin: QiankunPluginFn = (
    config: MicroAppConfig
): PluginOption => {
    let isProduction = false
    let base = '/'

    return {
        name: 'vite-plugin-qiankun',

        // ── Read resolved Vite config ───────────────────────────────────────────
        configResolved(resolvedConfig) {
            isProduction =
                resolvedConfig.command === 'build' ||
                resolvedConfig.isProduction
            base = resolvedConfig.base
        },

        // ── Dev server: CORS + HMR script transform ─────────────────────────────
        configureServer(server) {
            if (!config.dev?.enabled || isProduction) return

            return () => {
                registerDevMiddleware(server, config, base)
            }
        },

        // ── HTML transform pipeline ─────────────────────────────────────────────
        transformIndexHtml(html: string) {
            return transformHtml(html, config, isProduction, base)
        },
    }
}

export default qiankunPlugin
