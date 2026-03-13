import type { MicroOrchestrator } from '@meta-ux/types'
import { QiankunAdapter } from './qiankun/adapter'

export function createOrchestrator(): MicroOrchestrator {
    return new QiankunAdapter()
}
