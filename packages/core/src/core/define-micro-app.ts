import { MicroAppDefinition, QiankunLifeCycleMethods } from '@meta-ux/types'
import { normalizeProps } from './normalize-props'
import { resolveContainer } from './resolve-container'

export function isQiankun(): boolean {
    const w = window as any
    return (
        w.proxy != null ||
        w.__POWERED_BY_QIANKUN__ === true ||
        typeof w.qiankunName === 'string'
    )
}

/**
 * Wraps your app definition into qiankun-compatible lifecycle exports.
 *
 * The vite plugin's lifecycleResolver picks these exports up automatically
 * via the dynamic import .then(module => ...) it injects into index.html.
 * You never touch qiankun, window.proxy, or lifecycle wiring directly.
 *
 * @example
 * import { defineMicroApp } from '@meta-ux/core'
 *
 * export default defineMicroApp({
 *   name: 'cart-app',
 *
 *   async bootstrap() {
 *     // one-time setup
 *   },
 *
 *   async mount(props, container) {
 *     container.innerHTML = '<h1>Cart</h1>'
 *   },
 *
 *   async unmount() {
 *     // cleanup
 *   },
 * })
 */
export function defineMicroApp(
    definition: MicroAppDefinition
): QiankunLifeCycleMethods {
    // Qiankun calls this once before the first mount.
    async function bootstrap(): Promise<void> {
        console.debug(`[${definition.name}] bootstrap`)
        await definition.bootstrap?.()
    }

    // Qiankun calls this every time the app becomes active.
    // rawProps is whatever the shell passed in registerMicroApps({ props: ... })
    // plus qiankun internals. We normalise it before handing it to the user.
    async function mount(rawProps: Record<string, unknown>): Promise<void> {
        console.debug(`[${definition.name}] mount`, rawProps)

        const props = normalizeProps(rawProps)
        const container = resolveContainer(rawProps)

        await definition.mount(props, container)
    }

    // Qiankun calls this every time the app becomes inactive.
    async function unmount(rawProps: Record<string, unknown>): Promise<void> {
        console.debug(`[${definition.name}] unmount`)
        await definition.unmount()
    }

    // Qiankun calls this when the shell passes new props without a full remount.
    async function update(rawProps: Record<string, unknown>): Promise<void> {
        console.debug(`[${definition.name}] update`)
        if (definition.update) {
            await definition.update(normalizeProps(rawProps))
        }
    }

    return { bootstrap, mount, unmount, update }
}

export function isMicroFrontendEnv(): boolean {
    return isQiankun()
}
