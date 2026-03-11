/**
 * Qiankun passes `container` in props but its shape is inconsistent:
 *
 *  - In sandbox mode it's a `<div>` wrapper element, and your app's
 *    actual mount point (e.g. `#app`) lives *inside* it.
 *  - In some configs it's a CSS selector string.
 *  - In rare setups it's undefined and you fall back to a document query.
 *
 * This function normalises all three cases and always returns an HTMLElement.
 */
export function resolveContainer(
    rawProps: Record<string, unknown>,
    selector = '#app'
): HTMLElement {
    const raw = rawProps.container

    // Case 1: qiankun passed the wrapper element (most common in sandbox mode)
    // Look for the real mount point *inside* the wrapper first.
    if (raw instanceof HTMLElement) {
        const inner = raw.querySelector<HTMLElement>(selector)
        return inner ?? raw // fall back to the wrapper itself
    }

    // Case 2: someone passed a selector string
    if (typeof raw === 'string') {
        const el = document.querySelector<HTMLElement>(raw)
        if (el) return el
    }

    // Case 3: nothing useful in props — query the live document
    const el = document.querySelector<HTMLElement>(selector)
    if (el) return el

    throw new Error(
        `[micro-core] Could not resolve a mount container.\n` +
            `Tried: props.container, selector "${selector}" in document.\n` +
            `Make sure your index.html has a <div id="app"> or pass a container in shell props.`
    )
}
