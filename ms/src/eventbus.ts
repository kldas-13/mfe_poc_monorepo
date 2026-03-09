/**
 * eventbus.ts — Cross-MFE Event Bus
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The shell creates ONE instance of this bus and exposes it on
 * window.__UC_BUS before any MFE mounts. MFEs read it from window — they
 * never import this file directly (different repos, no build-time link).
 *
 * ── HOW TO USE IN ANY MFE (copy this pattern) ───────────────────────────
 *
 *   // In your MFE's mount() lifecycle:
 *   const bus = window.__UC_BUS
 *   if (!bus) return // shell not present (standalone dev mode)
 *
 *   // Subscribe — always save the unsubscribe fn and call it in unmount()
 *   const off = bus.on('graph:node-clicked', (data) => {
 *     console.log('clicked node:', data)
 *   })
 *
 *   // Publish
 *   bus.emit('bpmn:step-changed', { from: 'start', to: 'validate', ts: Date.now() })
 *
 *   // In your MFE's unmount() lifecycle:
 *   off() // removes the handler → no memory leaks
 *
 * ── CANONICAL EVENT NAMES ───────────────────────────────────────────────
 *
 *   mfe:ready              { name: string }
 *   graph:topology-loaded  { nodeCount: number, edgeCount: number }
 *   graph:node-clicked     { nodeId: string, label: string }
 *   graph:metrics-updated  { metrics: { id: string, rps: number }[] }
 *   bpmn:workflow-loaded   { workflowId: string, name: string }
 *   bpmn:step-changed      { from: string, to: string, ts: number }
 *   dashboard:refresh      {}
 *
 *   Add your own — there is no registry, naming is by convention.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type Handler<T = unknown> = (data: T) => void
export type Unsubscribe = () => void

export interface IEventBus {
  on<T = unknown>(event: string, handler: Handler<T>): Unsubscribe
  off<T = unknown>(event: string, handler: Handler<T>): void
  emit<T = unknown>(event: string, data: T): void
  once<T = unknown>(event: string, handler: Handler<T>): void
}

class EventBus implements IEventBus {
  // Map from event name → set of handlers
  private readonly _map = new Map<string, Set<Handler>>()

  on<T = unknown>(event: string, handler: Handler<T>): Unsubscribe {
    if (!this._map.has(event)) this._map.set(event, new Set())
    this._map.get(event)!.add(handler as Handler)
    return () => this.off(event, handler)
  }

  off<T = unknown>(event: string, handler: Handler<T>): void {
    this._map.get(event)?.delete(handler as Handler)
  }

  emit<T = unknown>(event: string, data: T): void {
    this._map.get(event)?.forEach((h) => {
      try {
        h(data)
      } catch (err) {
        // Never let a bad handler break the bus
        console.error(`[EventBus] handler threw on "${event}":`, err)
      }
    })
  }

  once<T = unknown>(event: string, handler: Handler<T>): void {
    const wrapper: Handler<T> = (data) => {
      handler(data)
      this.off(event, wrapper)
    }
    this.on(event, wrapper)
  }
}

// ── Singleton + window registration ──────────────────────────────────────────

export const bus: IEventBus = new EventBus()

// TypeScript declaration so any file can write window.__UC_BUS without cast
declare global {
  interface Window {
    /** Global event bus. Set by meta-shell before any MFE mounts. */
    __UC_BUS: IEventBus
  }
}

// This assignment runs when this module is first imported (in main.ts).
// By the time qiankun loads any MFE, __UC_BUS is already on window.
window.__UC_BUS = bus
