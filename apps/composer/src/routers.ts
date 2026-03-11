import microApps from './apps'

type RouteHandler = (path: string) => void

const handlers: RouteHandler[] = []

/** Navigate the shell (and trigger qiankun's activeRule matching) */
export const navigateTo = (path: string): void => {
    history.pushState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
    handlers.forEach((fn) => fn(path))
}

/** Register a callback fired on every route change */
export const onRouteChange = (fn: RouteHandler): void => {
    handlers.push(fn)
}

/** Returns the matching MicroApp for a given path, or null */
export const getActiveApp = (path = location.pathname) => {
    return microApps.find((app) => path.startsWith(app.activeRule)) ?? null
}

/** Sync the nav UI with the current route */
export const syncNavHighlight = (): void => {
    const active = getActiveApp()
    document.querySelectorAll<HTMLElement>('[data-route]').forEach((el) => {
        const route = el.dataset.route ?? ''
        el.classList.toggle('nav__link--active', active?.activeRule === route)
    })
}

// Keep nav in sync whenever the browser location changes
window.addEventListener('popstate', () => syncNavHighlight())
