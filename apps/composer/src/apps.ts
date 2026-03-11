export interface MicroApp {
    /** Must match the `name` in the child app's qiankun plugin config */
    name: string
    /** URL of the child app's dev server or build output */
    entry: string
    /** CSS selector of the DOM node to mount the child app into */
    container: string
    /** Shell-side route that activates this app */
    activeRule: string
    /** Arbitrary props forwarded to the child app's mount() */
    props?: Record<string, unknown>
}

const microApps: MicroApp[] = [
    {
        name: 'cart-app',
        entry: '//localhost:3002',
        container: '#micro-app-viewport',
        activeRule: '/cart',
        props: {
            routerBase: '/cart',
        },
    },
    {
        name: 'unified-canvas',
        entry: '//localhost:8080',
        container: '#micro-app-viewport',
        activeRule: '/unified-canvas',
        props: {
            routerBase: '/unified-canvas',
        },
    },
]

export default microApps
