// ─── Props the shell passes down to every child app ──────────────────────────

export interface MicroAppProps {
    /** The DOM node qiankun allocated — render your app here */
    container?: HTMLElement
    /** Base path this app is mounted at e.g. '/cart' */
    routerBase?: string
    /** Auth token from the shell */
    token?: string
    /** Shell-provided navigation — use instead of history directly */
    onNavigate?: (path: string, options?: { replace?: boolean }) => void
    /** Escape hatch: everything else the shell passed */
    [key: string]: unknown
}

// ─── What the child app author defines ───────────────────────────────────────

export interface MicroAppDefinition {
    /** Must match the name in vite.config and shell registration */
    name: string

    /**
     * Called once, before the first mount.
     * Use for one-time setup: global stores, SDK init, etc.
     */
    bootstrap?(): void | Promise<void>

    /**
     * Called every time qiankun activates this app.
     * @param props  Typed props from the shell
     * @param container  The DOM node to render into (resolved for you)
     */
    mount(props: MicroAppProps, container: HTMLElement): void | Promise<void>

    /**
     * Called every time qiankun deactivates this app.
     * Must clean up all side effects.
     */
    unmount(): void | Promise<void>

    /**
     * Optional. Called when the shell passes new props without a full remount.
     */
    update?(props: MicroAppProps): void | Promise<void>
}

// ─── What the plugin reads off the ES module ─────────────────────────────────

export interface QiankunLifecycles {
    bootstrap(): Promise<void>
    mount(rawProps: Record<string, unknown>): Promise<void>
    unmount(rawProps: Record<string, unknown>): Promise<void>
    update(rawProps: Record<string, unknown>): Promise<void>
}
