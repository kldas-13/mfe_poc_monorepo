import { CheerioAPI } from 'cheerio'
import { MicroAppConfig } from '../types'

/**
 * Applies CSS isolation strategy to the loaded HTML document.
 *
 * 'scoped'  — prefixes every <style> block's rules with [data-qiankun="appName"]
 *             so styles are naturally scoped without Shadow DOM.
 * 'none'    — no-op; let Qiankun's own strictStyleIsolation handle it.
 */
export const applyCssIsolation = (
    $: CheerioAPI,
    config: MicroAppConfig
): void => {
    const strategy = config.css?.isolation ?? 'none'
    if (strategy === 'none') return

    if (strategy === 'scoped') {
        const selector = `[data-qiankun="${config.name}"]`

        $('style').each((_, el) => {
            const css = $(el).html()
            if (!css) return

            // Prefix each rule block: "a { ... }" → "[data-qiankun="x"] a { ... }"
            const scoped = css.replace(
                /([^\r\n,{}]+)(,(?=[^}]*{)|\s*{)/g,
                (match, rule, delimiter) => {
                    const trimmed = rule.trim()
                    // Skip @-rules (keyframes, media, etc.) and already-scoped selectors
                    if (
                        trimmed.startsWith('@') ||
                        trimmed.startsWith(selector)
                    ) {
                        return match
                    }
                    return `${selector} ${trimmed}${delimiter}`
                }
            )

            $(el).html(scoped)
        })
    }

    if (config.css?.injectReset) {
        $('head').prepend(`
<style data-qiankun-reset="${config.name}">
  [data-qiankun="${config.name}"] * {
    box-sizing: border-box;
  }
</style>`)
    }
}
