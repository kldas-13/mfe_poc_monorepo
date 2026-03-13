import { createOrchestrator, registerMicroAppLoader } from '@meta-ux/composer'
import microApps from './apps'
registerMicroAppLoader()
const orchestrator = createOrchestrator()

// Error handling
orchestrator.onError((event) => {
    const { message } = event as ErrorEvent
    if (message?.includes('died in status LOADING_SOURCE_CODE')) {
        console.error('[shell] Micro-app failed to load.', event)
        showLoadError()
    }
})

// Register with lifecycle hooks
orchestrator.register(microApps, {
    beforeLoad: async (app) => {
        console.log(`[shell] Loading: ${app.name}`)
        showLoading()
    },
    afterMount: async (app) => {
        console.log(`[shell] Mounted: ${app.name}`)
        hideLoading()
    },
    afterUnmount: async (app) => {
        console.log(`[shell] Unmounted: ${app.name}`)
    },
})

orchestrator.setDefault('/unified-canvas')

orchestrator.start({
    prefetch: 'all',
    sandbox: { experimentalStyleIsolation: true },
})

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

document.querySelectorAll<HTMLElement>('[data-route]').forEach((link) => {
    link.addEventListener('click', (e) => {
        e.preventDefault()
        const route = (e.currentTarget as HTMLElement).dataset.route
        if (route) {
            orchestrator.navigateTo(route)
            const container = document.getElementById('load-app')

            if (container) {
                if (route === '/') {
                    container.innerHTML = `<micro-app-loader
                        style="width: 1000px; height: 100px"
                        class="bg-red-200"
                        app-name="cart-app"
                        entry="http://localhost:3002"
                    >
                    </micro-app-loader>`
                } else {
                    container.innerHTML = ''
                }
            }
        }
    })
})
