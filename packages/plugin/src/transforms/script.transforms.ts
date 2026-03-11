import { CheerioAPI } from 'cheerio'
import { Element } from 'domhandler'
import { MicroAppConfig } from '../types'

/**
 * Converts a <script type="module" src="..."> tag into an inline
 * <script>import('...')</script> dynamic import call.
 *
 * In dev mode with useDevMode, the public path is prefixed with the
 * runtime base injected by Qiankun (__INJECTED_PUBLIC_PATH_BY_QIANKUN__).
 */
export const convertModuleToDynamicImport = (
    $: CheerioAPI,
    scriptTag: Element,
    config: MicroAppConfig,
    isProduction: boolean,
    base: string
): ReturnType<CheerioAPI> | undefined => {
    if (!scriptTag) return undefined

    const script$ = $(scriptTag)
    const moduleSrc = script$.attr('src')
    if (!moduleSrc) return undefined

    let pathExpression: string

    if (config.assets?.publicPath) {
        // Explicit public path override
        pathExpression = `'${config.assets.publicPath}' + '${moduleSrc}'`
    } else if (config.dev?.enabled && !isProduction) {
        // Dynamically resolve base via Qiankun's injected path
        pathExpression = `(window.proxy ? (window.proxy.__INJECTED_PUBLIC_PATH_BY_QIANKUN__ + '..') : '') + '${moduleSrc}'`
    } else {
        pathExpression = `'${moduleSrc}'`
    }

    script$.removeAttr('src')
    script$.removeAttr('type')
    script$.html(`import(${pathExpression})`)

    return script$
}

/**
 * Appends the lifecycle resolver to the last dynamic import via .then()
 *
 * Using .then() instead of .finally() so the resolved ES module exports
 * are forwarded into the resolver as __LIFECYCLE_MODULE__. This lets the
 * resolver pick up `export { bootstrap, mount, unmount }` from the child's
 * entry file directly, without needing window.moudleQiankunAppLifeCycles.
 */
export const appendLifecycleToLastScript = (
    script$: ReturnType<CheerioAPI>,
    resolverCode: string
): void => {
    const existing = script$.html() ?? ''
    script$.html(
        `${existing}
  .then(function(__LIFECYCLE_MODULE__) {
    ${resolverCode}
  })
  .catch(function(err) {
    console.error('[qiankun-plugin] Failed to load entry module:', err);
  })`
    )
}

/**
 * Utility: find and empty a script tag matching a string in its body.
 * Useful for stripping dev-only injections in production.
 */
export const clearScriptByContent = (
    $: CheerioAPI,
    searchStr: string,
    replacement = ''
): void => {
    $('script').each((_, el) => {
        if ($(el).html()?.includes(searchStr)) {
            $(el).html(replacement)
        }
    })
}
