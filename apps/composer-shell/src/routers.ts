import microApps from './apps'

type RouteHandler = (path: string) => void

export class Router {
    private static handlers: RouteHandler[] = []

    static navigateTo(path: string): void {
        history.pushState(null, '', path)
        window.dispatchEvent(new PopStateEvent('popstate'))
        Router.handlers.forEach((fn) => fn(path))
    }

    static onRouteChange(fn: RouteHandler): void {
        Router.handlers.push(fn)
    }

    static getActiveApp(path = location.pathname) {
        return microApps.find((app) => path.startsWith(app.activeRule)) ?? null
    }

    static syncNavHighlight(): void {
        const active = Router.getActiveApp()
        document.querySelectorAll<HTMLElement>('[data-route]').forEach((el) => {
            const route = el.dataset.route ?? ''
            el.classList.toggle(
                'nav__link--active',
                active?.activeRule === route
            )
        })
    }

    static init(): void {
        window.addEventListener('popstate', () => Router.syncNavHighlight())
    }
}

Router.init()
