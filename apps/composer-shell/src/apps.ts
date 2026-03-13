import { MicroApp } from '@meta-ux/types'

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
