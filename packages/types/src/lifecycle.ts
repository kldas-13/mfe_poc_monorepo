export interface MicroAppProps {
    container?: HTMLElement
    routerBase?: string
    token?: string
    onNavigate?: (path: string, options?: { replace?: boolean }) => void
    [key: string]: unknown
}

/**
 * What a child micro-app must implement and export.
 * Framework-agnostic — React, Vue, or vanilla all implement this same shape.
 */
export interface MicroAppDefinition {
    name: string
    bootstrap?(): void | Promise<void>
    mount(props: MicroAppProps, container: HTMLElement): void | Promise<void>
    unmount(): void | Promise<void>
    update?(props: MicroAppProps): void | Promise<void>
}

/**
 * The exact shape qiankun expects as named exports from a child app.
 * Adapter layer maps MicroAppDefinition → this.
 * Never use this directly in child app code — use MicroAppDefinition.
 */
export interface QiankunLifeCycleMethods {
    bootstrap: () => void | Promise<void>
    mount: (props: MicroAppProps) => void | Promise<void>
    unmount: (props: MicroAppProps) => void | Promise<void>
    update: (props: MicroAppProps) => void | Promise<void>
}

/** Ambient window extension for child apps to detect their host. */
export interface QiankunWindow {
    __POWERED_BY_QIANKUN__?: boolean
    [x: string]: unknown
}
