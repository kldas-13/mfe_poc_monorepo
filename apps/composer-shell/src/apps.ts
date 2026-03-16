import { MicroApp } from '@meta-ux/types'

const microApps: MicroApp[] = [
    {
        name: 'cart-app',
        entry: '//localhost:3002',
        container: '#micro-app-viewport',
        activeRule: '/cart',
        props: {
            routerBase: '/cart',
            loadedFrom: 'registerApp',
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
    {
        name: 'kya',
        entry: '//localhost:5174',
        container: '#micro-app-viewport',
        activeRule: (location) => location.pathname.startsWith('/kya'),
        props: {
            routerBase: '/kya',
            basename: '/kya',
            baseurl: 'http://localhost:5174/',
        },
    },
]

export default microApps
