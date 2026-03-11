/**
 * EventBus.ts
 * -----------
 * Shared event bus for cross-MFE communication in the Unified Canvas platform.
 *
 * Architecture
 * ────────────
 * A single EventBus instance is created by the meta-ux-shell and exposed as:
 *
 *   window.__UC_BUS
 *
 * MFEs never create their own bus. They receive the shared instance via
 * qiankun props OR access it directly from window.__UC_BUS.
 *
 * Event naming convention (ENFORCED via namespace prefix):
 *
 *   {namespace}:{eventName}
 *
 *   Examples:
 *     "graph-canvas:node-selected"
 *     "bpmn-canvas:diagram-saved"
 *     "shell:navigation-changed"
 *
 * USAGE
 * ─────
 *   In meta-ux-shell (bootstrap once):
 *     import { createEventBus } from '@uc/mfe-core';
 *     const bus = createEventBus();
 *     // bus is automatically set on window.__UC_BUS
 *
 *   In any MFE (via qiankun props or window):
 *     import { getEventBus } from '@uc/mfe-core';
 *     const bus = getEventBus();
 *     bus.on('graph-canvas:node-selected', handler);
 *     bus.emit('bpmn-canvas:something', { payload });
 *     bus.off('graph-canvas:node-selected', handler);
 *
 *   Namespaced helper (recommended per-MFE):
 *     const ns = bus.namespace('graph-canvas');
 *     ns.emit('node-selected', { id: '123' });   // → "graph-canvas:node-selected"
 *     ns.on('node-selected', handler);
 *     ns.off('node-selected', handler);
 *     ns.destroy();  // removes ALL listeners for this namespace
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type EventPayload = Record<string, unknown> | unknown;
export type EventHandler<T extends EventPayload = EventPayload> = (payload: T) => void;

/** Full event name: "{namespace}:{eventName}" */
export type QualifiedEvent = `${string}:${string}`;

export interface IEventBus {
  emit<T extends EventPayload>(event: QualifiedEvent, payload?: T): void;
  on<T extends EventPayload>(event: QualifiedEvent, handler: EventHandler<T>): void;
  off<T extends EventPayload>(event: QualifiedEvent, handler: EventHandler<T>): void;
  once<T extends EventPayload>(event: QualifiedEvent, handler: EventHandler<T>): void;
  clear(event?: QualifiedEvent): void;
  namespace(ns: string): INamespacedBus;
}

export interface INamespacedBus {
  emit<T extends EventPayload>(event: string, payload?: T): void;
  on<T extends EventPayload>(event: string, handler: EventHandler<T>): void;
  off<T extends EventPayload>(event: string, handler: EventHandler<T>): void;
  once<T extends EventPayload>(event: string, handler: EventHandler<T>): void;
  /** Remove all listeners registered through this namespaced bus. */
  destroy(): void;
}

// ─── Internal store ───────────────────────────────────────────────────────────

type HandlerSet = Set<EventHandler>;

// ─── Core EventBus implementation ─────────────────────────────────────────────

class EventBusImpl implements IEventBus {
  private listeners: Map<string, HandlerSet> = new Map();

  private ensureSet(event: string): HandlerSet {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    return this.listeners.get(event)!;
  }

  emit<T extends EventPayload>(event: QualifiedEvent, payload?: T): void {
    this.validateEventName(event);
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    set.forEach(handler => {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${event}":`, err);
      }
    });
  }

  on<T extends EventPayload>(event: QualifiedEvent, handler: EventHandler<T>): void {
    this.validateEventName(event);
    this.ensureSet(event).add(handler as EventHandler);
  }

  off<T extends EventPayload>(event: QualifiedEvent, handler: EventHandler<T>): void {
    this.listeners.get(event)?.delete(handler as EventHandler);
  }

  once<T extends EventPayload>(event: QualifiedEvent, handler: EventHandler<T>): void {
    const wrapper: EventHandler = (payload) => {
      handler(payload as T);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  clear(event?: QualifiedEvent): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  namespace(ns: string): INamespacedBus {
    return new NamespacedBus(this, ns);
  }

  private validateEventName(event: string): void {
    if (!event.includes(':')) {
      throw new Error(
        `[EventBus] Invalid event name "${event}". ` +
        `Must follow the format "{namespace}:{eventName}", e.g. "graph-canvas:node-selected".`
      );
    }
  }
}

// ─── Namespaced bus ────────────────────────────────────────────────────────────

class NamespacedBus implements INamespacedBus {
  /** Track handlers registered through this ns bus for clean destroy(). */
  private registrations: Array<{ event: QualifiedEvent; handler: EventHandler }> = [];

  constructor(private readonly bus: IEventBus, private readonly ns: string) {}

  private qualify(event: string): QualifiedEvent {
    return `${this.ns}:${event}` as QualifiedEvent;
  }

  emit<T extends EventPayload>(event: string, payload?: T): void {
    this.bus.emit(this.qualify(event), payload);
  }

  on<T extends EventPayload>(event: string, handler: EventHandler<T>): void {
    const qualified = this.qualify(event);
    this.bus.on(qualified, handler);
    this.registrations.push({ event: qualified, handler: handler as EventHandler });
  }

  off<T extends EventPayload>(event: string, handler: EventHandler<T>): void {
    this.bus.off(this.qualify(event), handler);
    this.registrations = this.registrations.filter(r => r.handler !== handler);
  }

  once<T extends EventPayload>(event: string, handler: EventHandler<T>): void {
    this.bus.once(this.qualify(event), handler);
  }

  destroy(): void {
    this.registrations.forEach(({ event, handler }) => this.bus.off(event, handler));
    this.registrations = [];
  }
}

// ─── Window augmentation ──────────────────────────────────────────────────────

declare global {
  interface Window {
    __UC_BUS?: IEventBus;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Create and install the global EventBus onto `window.__UC_BUS`.
 * Called ONCE by the meta-ux-shell during bootstrap.
 * Subsequent calls return the existing instance (idempotent).
 */
export function createEventBus(): IEventBus {
  if (window.__UC_BUS) {
    console.warn('[EventBus] createEventBus() called more than once — returning existing instance.');
    return window.__UC_BUS;
  }
  const bus = new EventBusImpl();
  window.__UC_BUS = bus;
  return bus;
}

/**
 * Retrieve the global EventBus.
 * Callable from any MFE — no import of the shell is required.
 * Throws if the bus has not been initialised by the shell yet.
 */
export function getEventBus(): IEventBus {
  if (!window.__UC_BUS) {
    throw new Error(
      '[EventBus] window.__UC_BUS is not initialised. ' +
      'Ensure the meta-ux-shell has called createEventBus() before any MFE mounts.'
    );
  }
  return window.__UC_BUS;
}
