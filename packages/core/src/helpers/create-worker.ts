/**
 * createWorker — cross-origin Worker factory for micro-frontends
 *
 * The blob-text approach breaks module workers because:
 *  - The fetched text is Vite-transformed source, not a self-contained bundle
 *  - Relative imports inside the worker resolve against blob: (no base path)
 *  - The browser may treat it as classic script even with type:'module'
 *
 * The correct approach: create a tiny same-origin blob that does ONE thing —
 * `import` the actual worker URL. Dynamic import inside a blob worker DOES
 * work cross-origin because it's a network fetch (respects CORS), not a
 * Worker constructor call (which enforces same-origin).
 *
 *   blob origin  = page origin (5173) ✓  browser allows Worker()
 *   import(url)  = fetch from 8080    ✓  CORS allows this
 *   self.onmessage runs in the worker ✓
 */

function needsCrossOriginWorkaround(scriptUrl: string | URL): boolean {
    try {
        const workerOrigin = new URL(scriptUrl).origin
        if (workerOrigin !== window.location.origin) return true
    } catch {
        return false // relative or blob URL — already same origin
    }
    if ((window as any).proxy != null) return true
    if ((window as any).__POWERED_BY_QIANKUN__) return true
    return false
}

export function createWorker(
    scriptUrl: string | URL,
    options: WorkerOptions = { type: 'module' }
): Worker {
    if (!needsCrossOriginWorkaround(scriptUrl)) {
        return new Worker(scriptUrl, options)
    }

    // Create a minimal same-origin blob whose only job is to import() the
    // real worker script. This sidesteps the same-origin Worker() restriction
    // because:
    //   1. new Worker(blobUrl) > same origin as page
    const importBlob = new Blob([`import ${JSON.stringify(scriptUrl)}`], {
        type: 'text/javascript',
    })

    const blobUrl = URL.createObjectURL(importBlob)
    const worker = new Worker(blobUrl, { type: 'module' })

    // Revoke after the worker has had time to start the import
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000)

    return worker
}

declare global {
    interface Window {
        __POWERED_BY_QIANKUN__?: boolean
    }
}
