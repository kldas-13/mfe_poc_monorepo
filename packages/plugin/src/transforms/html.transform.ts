import * as cheerio from 'cheerio'
import { MicroAppConfig } from '../types'
import {
    appendLifecycleToLastScript,
    convertModuleToDynamicImport,
} from './script.transforms'
import {
    applyCssIsolation,
    createLifecycleResolver,
    createQiankunHelper,
} from '../helpers'

/**
 * Main HTML transformation pipeline.
 *
 * Called by Vite's transformIndexHtml hook. Applies in order:
 *  1. Convert all module scripts to dynamic imports
 *  2. Append lifecycle resolver to the last import's .finally()
 *  3. Inject the qiankun helper <script> into <body>
 *  4. Apply CSS isolation (if configured)
 */
export const transformHtml = (
    html: string,
    config: MicroAppConfig,
    isProduction: boolean,
    base: string
): string | undefined => {
    const $ = cheerio.load(html)

    // ── 1. Gather all module / crossorigin scripts ──────────────────────────
    const moduleTags = $(
        'body script[type=module], head script[crossorigin=""]'
    )
    if (!moduleTags.length) return undefined

    // ── 2. Convert to dynamic imports ────────────────────────────────────────
    const len = moduleTags.length
    let lastScript$: ReturnType<typeof $> | undefined

    moduleTags.each((i, moduleTag) => {
        const script$ = convertModuleToDynamicImport(
            $,
            moduleTag,
            config,
            isProduction,
            base
        )
        if (!script$) return

        if (i === len - 1) {
            lastScript$ = script$
        }
    })

    // ── 3. Wire lifecycle resolver into the last script ───────────────────────
    if (lastScript$) {
        appendLifecycleToLastScript(
            lastScript$,
            createLifecycleResolver(config)
        )
    }

    // ── 4. Inject qiankun bootstrap helper ───────────────────────────────────
    $('body').append(`<script>${createQiankunHelper(config)}</script>`)

    // ── 5. CSS isolation ─────────────────────────────────────────────────────
    applyCssIsolation($, config)

    return $.html()
}
