import { QiankunAdapter } from './qiankun/adapter'
import type {
    MicroOrchestrator,
    MicroApp,
    LifecycleHooks,
    StartOptions,
} from './types'

export type { MicroOrchestrator, MicroApp, LifecycleHooks, StartOptions }

export function createOrchestrator(): MicroOrchestrator {
    return new QiankunAdapter()
}
