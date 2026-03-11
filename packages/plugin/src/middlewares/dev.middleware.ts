import * as cheerio from 'cheerio'
import type { ViteDevServer } from 'vite'
import { MicroAppConfig } from '../types'
import { convertModuleToDynamicImport } from '../transforms'

/**
 * Registers a Connect middleware on the Vite dev server that:
 *
 *  1. Injects CORS headers so the host app can load this micro-app
 *     from a different origin during development.
 *
 *  2. Converts the @vite/client script tag to a dynamic import so
 *     Qiankun's sandbox can intercept it (same reason as other modules).
 */
export const registerDevMiddleware = (
    server: ViteDevServer,
    config: MicroAppConfig,
    base: string
): void => {
    const { dev = {} } = config
    const allowedOrigins = dev.allowedOrigins ?? ['*']

    server.middlewares.use((req, res, next) => {
        // ── CORS headers ─────────────────────────────────────────────────────
        const origin = req.headers.origin ?? ''
        const allowed =
            allowedOrigins.includes('*') || allowedOrigins.includes(origin)

        if (allowed) {
            res.setHeader(
                'Access-Control-Allow-Origin',
                allowedOrigins.includes('*') ? '*' : origin
            )
            res.setHeader(
                'Access-Control-Allow-Methods',
                'GET,POST,PUT,DELETE,OPTIONS'
            )
            res.setHeader(
                'Access-Control-Allow-Headers',
                'Content-Type,Authorization'
            )
            res.setHeader('Access-Control-Allow-Credentials', 'true')
        }

        if (req.method === 'OPTIONS') {
            res.statusCode = 204
            res.end()
            return
        }

        // ── Transform HTML responses ──────────────────────────────────────────
        const end = res.end.bind(res)

        ;(res as any).end = (...args: any[]) => {
            let [htmlStr, ...rest] = args

            if (typeof htmlStr === 'string' && htmlStr.includes('<!DOCTYPE')) {
                const $ = cheerio.load(htmlStr)

                // Convert @vite/client to dynamic import
                const viteClientTag = $(
                    `script[src="${base}@vite/client"]`
                ).get(0)
                if (viteClientTag) {
                    convertModuleToDynamicImport(
                        $,
                        viteClientTag,
                        config,
                        false,
                        base
                    )
                }

                htmlStr = $.html()
            }

            end(htmlStr, ...rest)
        }

        next()
    })
}
