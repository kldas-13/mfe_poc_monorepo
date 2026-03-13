import type {
    MicroApp,
    LifecycleHooks,
    StartOptions,
    LoadAppOptions,
    MicroAppInstance,
} from './app'

export interface MicroOrchestrator {
    register(apps: MicroApp[], hooks?: LifecycleHooks): void
    start(options?: StartOptions): void
    setDefault(route: string): void
    onError(handler: (event: string | Event) => void): void
    navigateTo(route: string): void
    loadApp(app: MicroApp, options?: LoadAppOptions): MicroAppInstance
}
