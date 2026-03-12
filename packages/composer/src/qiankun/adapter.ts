import {
    registerMicroApps,
    start,
    addGlobalUncaughtErrorHandler,
    setDefaultMountApp,
    type RegistrableApp,
    type AppMetadata,
    loadMicroApp,
} from 'qiankun'
import type {
    MicroApp,
    LifecycleHooks,
    StartOptions,
    MicroOrchestrator,
    LoadAppOptions,
    MicroAppInstance,
} from '../types'

export class QiankunAdapter implements MicroOrchestrator {
    register(apps: MicroApp[], hooks: LifecycleHooks = {}): void {
        const registrable: RegistrableApp<Record<string, unknown>>[] = apps.map(
            (app) => ({
                name: app.name,
                entry: app.entry,
                container: app.container,
                activeRule: app.activeRule,
                props: app.props ?? {},
            })
        )
        const appMap = new Map<string, MicroApp>(apps.map((a) => [a.name, a]))
        const resolve = (meta: AppMetadata): MicroApp => {
            const app = appMap.get(meta.name)
            if (!app) throw new Error(`[micro-core] Unknown app: ${meta.name}`)
            return app
        }

        registerMicroApps(registrable, {
            beforeLoad: hooks.beforeLoad
                ? [(meta: AppMetadata) => hooks.beforeLoad!(resolve(meta))]
                : [],
            beforeMount: hooks.beforeMount
                ? [(meta: AppMetadata) => hooks.beforeMount!(resolve(meta))]
                : [],
            afterMount: hooks.afterMount
                ? [(meta: AppMetadata) => hooks.afterMount!(resolve(meta))]
                : [],
            afterUnmount: hooks.afterUnmount
                ? [(meta: AppMetadata) => hooks.afterUnmount!(resolve(meta))]
                : [],
        })
    }

    start(options: StartOptions = {}): void {
        start({
            prefetch: options.prefetch ?? 'all',
            sandbox: options.sandbox ?? { experimentalStyleIsolation: true },
        })
    }

    setDefault(route: string): void {
        setDefaultMountApp(route)
    }

    onError(handler: (event: string | Event) => void): void {
        addGlobalUncaughtErrorHandler(handler)
    }

    navigateTo(route: string): void {
        history.pushState(null, '', route)
        window.dispatchEvent(new PopStateEvent('popstate'))
    }

    loadApp(app: MicroApp, options: LoadAppOptions = {}): MicroAppInstance {
        const instance = loadMicroApp(
            {
                name: app.name,
                entry: app.entry,
                container: app.container,
                props: {
                    ...(app.props ?? {}),
                    ...(options.props ?? {}),
                },
            },
            {
                sandbox: options.sandbox ?? {
                    experimentalStyleIsolation: true,
                },
            }
        )

        return {
            mount: () => instance.mountPromise,
            unmount: () => instance.unmountPromise,
            update: (customProps) =>
                instance.update?.(customProps) ?? Promise.resolve(null),
            getStatus: () => instance.getStatus(),
        }
    }
}
