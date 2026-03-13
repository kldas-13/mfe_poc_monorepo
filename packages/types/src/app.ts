/**
 * App descriptor used when registering apps with the orchestrator.
 * This is YOUR type — never import qiankun's RegistrableApp directly.
 */
export interface MicroApp {
    /** Must match the name in the child app's plugin config */
    name: string
    /** URL of the child app's dev server or build output */
    entry: string
    /** CSS selector of the DOM node to mount the child app into */
    container: string
    /** Shell-side route that activates this app */
    activeRule: string
    /** Arbitrary props forwarded to the child app's mount() */
    props?: Record<string, unknown>
}

export interface LifecycleHooks {
    beforeLoad?: (app: MicroApp) => Promise<void>
    beforeMount?: (app: MicroApp) => Promise<void>
    afterMount?: (app: MicroApp) => Promise<void>
    afterUnmount?: (app: MicroApp) => Promise<void>
}

export interface StartOptions {
    defaultApp?: string
    prefetch?: boolean | 'all'
    sandbox?: {
        experimentalStyleIsolation?: boolean
        strictStyleIsolation?: boolean
    }
}

export interface LoadAppOptions {
    props?: Record<string, unknown>
    sandbox?: {
        experimentalStyleIsolation?: boolean
        strictStyleIsolation?: boolean
    }
}

/**
 * Handle returned by orchestrator.loadApp().
 * Gives you manual control over a loaded app's lifecycle.
 */
export interface MicroAppInstance {
    mount(): Promise<null>
    unmount(): Promise<null>
    update(customProps: Record<string, unknown>): Promise<null>
    getStatus(): string
}
