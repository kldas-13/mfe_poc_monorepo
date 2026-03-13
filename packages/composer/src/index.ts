import type { MicroOrchestrator } from '@meta-ux/types'
import { QiankunAdapter } from './qiankun/adapter'

export {
    MicroAppLoader,
    registerMicroAppLoader,
} from './components/micro-app-loader'

export function createOrchestrator(): MicroOrchestrator {
    return new QiankunAdapter()
}
