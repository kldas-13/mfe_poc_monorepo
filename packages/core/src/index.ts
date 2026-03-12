import { QiankunWindow } from './types'

export { defineMicroApp, isQiankun } from './core/define-micro-app'

export { createWorker } from './helpers/create-worker'

export type {
    MicroAppDefinition,
    MicroAppProps,
    QiankunLifeCycleMethods,
    QiankunWindow,
} from './types'

export const qiankunWindow: QiankunWindow =
    // @ts-expect-error window.proxy might be udefined
    typeof window !== 'undefined' ? window.proxy || window : {}
