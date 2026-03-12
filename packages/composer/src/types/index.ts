export interface MicroApp {
    name: string
    entry: string
    container: string
    activeRule: string
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

export interface MicroOrchestrator {
    register(apps: MicroApp[], hooks?: LifecycleHooks): void
    start(options?: StartOptions): void
    setDefault(route: string): void
    onError(handler: (event: string | Event) => void): void
    navigateTo(route: string): void
    loadApp(app: MicroApp, options?: LoadAppOptions): MicroAppInstance
}

export interface MicroAppInstance {
    mount(): Promise<null>
    unmount(): Promise<null>
    update(customProps: Record<string, unknown>): Promise<null>
    getStatus(): string
}
