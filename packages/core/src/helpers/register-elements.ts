export function registerElement(
    tagName: string,
    ElementClass: CustomElementConstructor
): void {
    const realWindow = _getRealWindow()
    const registry = realWindow.customElements

    if (!registry) {
        console.error(
            `[micro-core] registerElement("${tagName}"): ` +
                `customElements registry not found on the resolved window.`
        )
        return
    }

    if (registry.get(tagName)) {
        // Already registered — safe to skip, not an error.
        // This happens when HMR re-evaluates the module or the same lib
        // is imported by multiple micro-apps.
        return
    }

    registry.define(tagName, ElementClass)
}

function _getRealWindow(): Window & typeof globalThis {
    const w = window as any

    // ProxySandbox (qiankun ≥ 2.6, default since 2.10)
    // Set as __globalThis on the proxy target
    if (_isRealWindow(w.__globalThis)) return w.__globalThis

    // LegacySandbox (opt-in, older apps)
    if (_isRealWindow(w.__rawWindow)) return w.__rawWindow

    // SnapshotSandbox / no sandbox / running in shell
    // window itself is already the real window
    return window
}

function _isRealWindow(
    candidate: unknown
): candidate is Window & typeof globalThis {
    return (
        candidate != null &&
        typeof candidate === 'object' &&
        'customElements' in (candidate as object) &&
        (candidate as any).window === candidate
    )
}
