/**
 * createWorker
 *
 * Problem:
 *   `new Worker(new URL('./execution.worker.ts', import.meta.url))` works
 *   fine when the app runs standalone. But inside qiankun:
 *
 *     - The PAGE origin is the shell's origin   (e.g. http://localhost:5173)
 *     - The WORKER script lives on the child    (e.g. http://localhost:8080)
 *
 *   Browsers enforce that a Worker's script must be same-origin as the page
 *   that creates it. CORS headers do NOT bypass this — it is a hard security
 *   rule (spec: https://html.spec.whatwg.org/#dom-worker).
 *
 * Solution:
 *   Detect cross-origin by comparing the worker script URL's origin against
 *   the page origin directly. If they differ, fetch the script text (which
 *   CORS allows) and wrap it in a blob: URL (which is always same-origin).
 *
 * Usage:
 *   // Before:
 *   const worker = new Worker(
 *     new URL('./worker/execution.worker.ts', import.meta.url),
 *     { type: 'module' }
 *   )
 *
 *   // After — drop-in, works in both standalone and qiankun:
 *   import { createWorker } from 'micro-core'
 *   const worker = await createWorker(
 *     new URL('./worker/execution.worker.ts', import.meta.url).href
 *   )
 */

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * Determines whether the blob: URL workaround is actually needed.
 *
 * We check three independent signals so the function is correct regardless
 * of Qiankun sandbox mode, call timing, or internal Qiankun flag changes.
 *
 * Signal priority:
 *  1. Origin mismatch — the exact condition that causes SecurityError.
 *     Most reliable: directly tests what the browser will reject.
 *  2. window.proxy — Qiankun always creates this in sandbox mode.
 *  3. __POWERED_BY_QIANKUN__ — Qiankun's own flag, least reliable
 *     because it lives on window.proxy and timing-dependent.
 */
function needsBlobWorkaround(workerScriptUrl: string): boolean {
    // Signal 1: direct origin comparison — this is the actual browser check.
    // If origins already match, Worker() will succeed natively; skip blob path.
    try {
        const workerOrigin = new URL(workerScriptUrl).origin
        if (workerOrigin !== window.location.origin) return true
    } catch {
        // Relative or blob URL — same-origin by definition, no workaround needed
        return false
    }

    // Signal 2: window.proxy is set — Qiankun always sets this in sandbox mode.
    // Acts as a sanity-check fallback if the URL comparison was somehow wrong.
    if ((window as any).proxy != null) return true

    // Signal 3: Qiankun's own flag — unreliable due to proxy/timing issues
    // but kept as a last-resort signal.
    if ((window as any).__POWERED_BY_QIANKUN__) return true

    return false
}

export async function createWorker(
    scriptUrl: string,
    options: WorkerOptions = { type: 'module' }
): Promise<Worker> {
    if (!needsBlobWorkaround(scriptUrl)) {
        // Same origin — standard Worker construction, full devtools support.
        return new Worker(scriptUrl, options)
    }

    // Cross-origin: fetch script text then re-serve as a blob: URL.
    // fetch() respects CORS so this succeeds as long as the child dev server
    // sends Access-Control-Allow-Origin: * for worker script requests.
    const response = await fetch(scriptUrl)

    if (!response.ok) {
        throw new Error(
            `[micro-core] Failed to fetch worker script: ${scriptUrl} (${response.status})`
        )
    }

    const scriptText = await response.text()

    const blob = new Blob([scriptText], { type: 'text/javascript' })
    const blobUrl = URL.createObjectURL(blob)

    const worker = new Worker(blobUrl, options)

    // Revoke after a tick — the worker holds its own reference once started,
    // so the blob can be released from the main thread's memory.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 0)

    return worker
}

declare global {
    interface Window {
        __POWERED_BY_QIANKUN__?: boolean
    }
}
