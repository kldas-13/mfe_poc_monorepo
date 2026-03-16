/**
 * App descriptor used when registering apps with the orchestrator.
 * Reflects qiankun's full RegisterMicroAppsConfig shape.
 */
export interface MicroApp {
    /** Must match the name in the child app's plugin config */
    name: string

    /** URL of the child app's dev server or build output
     *  e.g. '//localhost:5174' or 'https://app.example.com'
     */
    entry:
        | string
        | {
              /** Individual script URLs to load */
              scripts?: string[]
              /** Individual style URLs to load */
              styles?: string[]
              /** Inline HTML string used as the app's root markup */
              html?: string
          }

    /** CSS selector or an HTMLElement to mount the child app into */
    container: string | HTMLElement

    /**
     * When this app should be activated.
     * - string  → qiankun treats it as a pathname prefix  e.g. '/kya'
     * - string[] → any of the prefixes activate the app
     * - function → full control, return true to activate
     *              e.g. (location) => location.pathname.startsWith('/kya')
     */
    activeRule: string | string[] | ((location: Location) => boolean)

    /** Arbitrary props forwarded to the child app's bootstrap/mount/unmount */
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
