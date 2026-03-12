export interface QiankunProps {
    container?: HTMLElement
    [x: string]: any
}

export interface MicroAppProps extends QiankunProps {
    routerBase?: string
    token?: string
    onNavigate?: (path: string, options?: { replace?: boolean }) => void
    [key: string]: unknown
}

export interface MicroAppDefinition {
    name: string

    /**
     * Called once, before the first mount.
     * Use for one-time setup: global stores, SDK init, etc.
     */
    bootstrap?(): void | Promise<void>

    /**
     * Called every time qiankun activates this app.
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

export type QiankunLifeCycleMethods = {
    bootstrap: () => void | Promise<void>
    mount: (props: MicroAppProps) => void | Promise<void>
    unmount: (props: MicroAppProps) => void | Promise<void>
    update: (props: MicroAppProps) => void | Promise<void>
}

export interface QiankunWindow {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __POWERED_BY_QIANKUN__?: boolean
    [x: string]: any
}
