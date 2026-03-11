import { MicroAppProps } from '../types'

/**
 * Strips qiankun internals from props and gives the app author a clean object.
 *
 * Qiankun injects: name, container, unmountSelf, onGlobalStateChange, etc.
 * None of those should leak into the app's own mount() signature.
 */
export function normalizeProps(raw: Record<string, unknown>): MicroAppProps {
    // Keys qiankun adds internally — not useful to the child app
    const QIANKUN_INTERNAL_KEYS = new Set([
        'name',
        'container',
        'unmountSelf',
        'onGlobalStateChange',
        'setGlobalState',
    ])

    const props: MicroAppProps = {}

    for (const [key, value] of Object.entries(raw)) {
        if (!QIANKUN_INTERNAL_KEYS.has(key)) {
            props[key] = value
        }
    }

    // Convenience: always have routerBase even if shell forgot to pass it
    if (!props.routerBase) {
        props.routerBase = '/'
    }

    return props
}
