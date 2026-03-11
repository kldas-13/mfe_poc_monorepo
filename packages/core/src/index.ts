// ── Child app API (the only things a child app should ever import) ────────────
export { defineMicroApp } from './core/define-micro-app'

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
    // App definition
    MicroAppDefinition,
    MicroAppProps,
    QiankunLifecycles,
} from './types'
