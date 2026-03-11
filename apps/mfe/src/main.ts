/**
 * Child app entry — src/main.ts
 *
 * Two responsibilities:
 *  1. Export qiankun lifecycle functions (bootstrap, mount, unmount, update)
 *     so the plugin's lifecycleResolver can find them via ES module exports.
 *  2. Detect standalone mode (running without qiankun) and mount normally.
 */

// ── Your app bootstrap (framework-agnostic example) ──────────────────────────
// let appInstance: { unmount: () => void } | null = null

// function createApp(container: Element | string) {
//     const root =
//         typeof container === 'string'
//             ? document.querySelector(container)
//             : container

//     if (!root)
//         throw new Error(`[cart-app] Mount container not found: ${container}`)

//     // Replace with your real framework mount, e.g.:
//     // createVueApp(App).mount(root)
//     // ReactDOM.createRoot(root).render(<App />)
//     root.innerHTML =
//         '<div style="background-color: red">Cart App is running 🛒</div>'

//     return {
//         unmount() {
//             root.innerHTML = ''
//         },
//     }
// }

// export async function bootstrap() {
//     console.log('[cart-app] bootstrap')
// }

// export async function mount(props: Record<string, unknown>) {
//     console.log('[cart-app] mount', props)

//     const container = props.container as Element | undefined
//     appInstance = createApp(container ?? '#app')
// }

// export async function unmount(_props: Record<string, unknown>) {
//     console.log('[cart-app] unmount')
//     appInstance?.unmount()
//     appInstance = null
// }

// export async function update(props: Record<string, unknown>) {
//     console.log('[cart-app] update', props)
//     // handle prop updates if needed
// }

// // ── Standalone mode (opened directly in browser, not via qiankun) ─────────────
// // @ts-ignore
// if (!window?.__POWERED_BY_QIANKUN__) {
//     mount({})
// }

import { defineMicroApp } from '@meta-ux/core'

const { mount, unmount, bootstrap, update } = defineMicroApp({
    name: 'cart-app', // must match vite plugin config + shell registration

    async bootstrap() {
        // one-time init: create stores, load config, register service workers
        console.log('[cart-app] bootstrap')
    },

    async mount(props, container) {
        // props.routerBase   → '/cart'
        // props.token        → auth token from shell
        // props.onNavigate   → call this to navigate (instead of history directly)
        // container          → the real HTMLElement to render into

        console.log(props)

        container.innerHTML = `<h1>Cart App</h1><p>Mounted at ${props.routerBase}</p>`

        // standalone guard — works when opened directly without the shell
        // @ts-ignore
        if (!window.__POWERED_BY_QIANKUN__) {
            console.log('[cart-app] running standalone')
        }
    },

    async unmount() {
        // tear down everything: event listeners, timers, framework instances
        console.log('[cart-app] unmounted')
    },

    async update(props) {
        // shell passed new token/user without a full remount
        console.log('[cart-app] props updated', props)
    },
})

export { mount, unmount, bootstrap, update }

// ── Standalone mode ────────────────────────────────────────────────────────────
// When the child is opened directly in the browser (not via qiankun),
// run mount manually so the app still works in isolation.
// @ts-ignore
if (!window.__POWERED_BY_QIANKUN__) {
    const container = document.getElementById('app')!
    container.innerHTML = `<h1>Cart App (standalone)</h1>`
}
