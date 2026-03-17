import { QiankunWindow } from '@meta-ux/types'

export {
    defineMicroApp,
    isQiankun,
    isMicroFrontendEnv,
} from './core/define-micro-app'

export { createWorker } from './helpers/create-worker'
export { registerElement } from './helpers/register-elements'

export const qiankunWindow: QiankunWindow =
    // @ts-expect-error window.proxy might be udefined
    typeof window !== 'undefined' ? window.proxy || window : {}
