import {
    registerMicroApps,
    start,
    addGlobalUncaughtErrorHandler,
    setDefaultMountApp,
    type RegistrableApp,
} from 'qiankun'
import microApps from './apps'
import { navigateTo } from './routers'

// ── Global error handler ──────────────────────────────────────────────────────
addGlobalUncaughtErrorHandler((event) => {
    const { message } = event as ErrorEvent
    if (message?.includes('died in status LOADING_SOURCE_CODE')) {
        console.error(
            '[shell] Micro-app failed to load. Is the child server running?',
            event
        )
        showLoadError()
    }
})

// ── Register all apps ─────────────────────────────────────────────────────────
const registrable: RegistrableApp<Record<string, unknown>>[] = microApps.map(
    (app) => ({
        name: app.name,
        entry: app.entry,
        container: app.container,
        activeRule: app.activeRule,
        props: {
            ...(app.props ?? {}),
            // Shared helpers passed to every child app
            onNavigate: navigateTo,
            getToken: () => localStorage.getItem('auth_token'),
        },
    })
)

registerMicroApps(registrable, {
    beforeLoad: [
        (app) => {
            console.log(`[shell] Loading: ${app.name}`)
            showLoading()
            return Promise.resolve()
        },
    ],
    beforeMount: [
        (app) => {
            console.log(`[shell] Mounting: ${app.name}`)
            return Promise.resolve()
        },
    ],
    afterMount: [
        (app) => {
            console.log(`[shell] Mounted: ${app.name}`)
            hideLoading()
            return Promise.resolve()
        },
    ],
    afterUnmount: [
        (app) => {
            console.log(`[shell] Unmounted: ${app.name}`)
            return Promise.resolve()
        },
    ],
})

// ── Default app when hitting '/' ──────────────────────────────────────────────
setDefaultMountApp('/unified-canvas')

// ── Start ─────────────────────────────────────────────────────────────────────
start({
    sandbox: {
        strictStyleIsolation: false, // set true to use Shadow DOM isolation
        experimentalStyleIsolation: true,
    },
    prefetch: 'all', // prefetch other apps after first app mounts
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function showLoading() {
    const el = document.getElementById('micro-app-loading')
    if (el) el.style.display = 'flex'
}

function hideLoading() {
    const el = document.getElementById('micro-app-loading')
    if (el) el.style.display = 'none'
}

function showLoadError() {
    hideLoading()
    const viewport = document.getElementById('micro-app-viewport')
    if (viewport) {
        viewport.innerHTML = `
      <div class="load-error">
        <span class="load-error__icon">⚠</span>
        <p class="load-error__title">App failed to load</p>
        <p class="load-error__sub">Make sure the child app server is running.</p>
      </div>
    `
    }
}
