import { QiankunWindow } from '@meta-ux/types'

export { defineMicroApp, isQiankun } from './core/define-micro-app'

export { createWorker } from './helpers/create-worker'

export const qiankunWindow: QiankunWindow =
    // @ts-expect-error window.proxy might be udefined
    typeof window !== 'undefined' ? window.proxy || window : {}
