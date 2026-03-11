import { PluginOption } from 'vite'

// ─── Lifecycle Hooks ──────────────────────────────────────────────────────────

export type QiankunLifecycleName = 'bootstrap' | 'mount' | 'unmount' | 'update'

export interface QiankunLifecycle {
    bootstrap: () => Promise<void>
    mount: (props: unknown) => Promise<void>
    unmount: (props: unknown) => Promise<void>
    update: (props: unknown) => Promise<void>
}

// ─── Asset Handling ───────────────────────────────────────────────────────────

export type AssetInjectStrategy = 'dynamic-import' | 'fetch' | 'none'

export interface AssetConfig {
    /**
     * How to handle script injection.
     * - 'dynamic-import': converts <script type="module"> to dynamic import() calls (default)
     * - 'fetch': fetches and evals scripts (useful for CSP-restricted envs)
     * - 'none': no transformation
     */
    scriptStrategy?: AssetInjectStrategy

    /**
     * Public path override for assets in the micro-app.
     * Falls back to __INJECTED_PUBLIC_PATH_BY_QIANKUN__ if not set.
     */
    publicPath?: string
}

// ─── Communication ────────────────────────────────────────────────────────────

export interface CommunicationConfig {
    /**
     * Whether to set up a shared event bus between micro-apps via window.
     * Defaults to false.
     */
    enableEventBus?: boolean

    /**
     * Custom key on window where the event bus will be mounted.
     * Defaults to '__MICRO_APP_EVENT_BUS__'
     */
    eventBusKey?: string

    /**
     * Whether to inject initial props passed by qiankun into a reactive store.
     * Useful for frameworks like Vue/React that need reactivity.
     */
    injectProps?: boolean
}

// ─── CSS Isolation ────────────────────────────────────────────────────────────

export type CssIsolationStrategy =
    | 'none'
    | 'scoped' // wraps styles with [data-qiankun="appName"] selector
    | 'shadow-dom' // hint to use shadow DOM (qiankun config-level)

export interface CssConfig {
    /**
     * Strategy for CSS isolation.
     * Defaults to 'none' (let Qiankun handle it).
     */
    isolation?: CssIsolationStrategy

    /**
     * Whether to inject a CSS reset scoped to this micro-app.
     */
    injectReset?: boolean
}

// ─── Dev Mode ────────────────────────────────────────────────────────────────

export interface DevConfig {
    /**
     * Enable dev-specific transforms (dynamic import for @vite/client, HMR support).
     */
    enabled?: boolean

    /**
     * Port for the micro-app dev server. Used for CORS headers injection.
     */
    port?: number

    /**
     * Origins to allow in CORS headers during dev.
     * Defaults to ['*'] if not set.
     */
    allowedOrigins?: string[]
}

// ─── Plugin Root Config ───────────────────────────────────────────────────────

export interface MicroAppConfig {
    /**
     * Unique name for this micro-app. Must match the name registered in the host.
     */
    name: string

    /**
     * Asset handling configuration.
     */
    assets?: AssetConfig

    /**
     * Cross-app communication helpers.
     */
    communication?: CommunicationConfig

    /**
     * CSS isolation strategy.
     */
    css?: CssConfig

    /**
     * Dev mode configuration.
     */
    dev?: DevConfig

    /**
     * Custom lifecycle hooks to run around the qiankun lifecycle.
     * Useful for teardown logic, analytics, etc.
     */
    hooks?: {
        beforeMount?: (props: unknown) => void | Promise<void>
        afterMount?: (props: unknown) => void | Promise<void>
        beforeUnmount?: (props: unknown) => void | Promise<void>
        afterUnmount?: (props: unknown) => void | Promise<void>
    }
}

// ─── Plugin Function Signature ────────────────────────────────────────────────

export type QiankunPluginFn = (config: MicroAppConfig) => PluginOption
