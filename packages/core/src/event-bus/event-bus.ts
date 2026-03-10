import {
    EventCallback,
    EventPayload,
    IBaseEvent,
    Listener,
    OnOptions,
    Unsubscribe,
} from '../types'
import { BaseEvent } from './base-event'

const DEFAULT_PRIORITY = 1000

export class EventBus<
    TEventMap extends Record<string, Record<string, unknown>> = Record<
        string,
        Record<string, unknown>
    >,
> {
    private readonly _listeners: Record<string, Listener | null> = {}

    on<TType extends keyof TEventMap & string>(
        events: TType | TType[],
        callback: EventCallback<EventPayload<TEventMap, TType>>,
        options?: OnOptions
    ): Unsubscribe

    on(
        events: string | string[],
        callback: EventCallback<any>,
        options?: OnOptions
    ): Unsubscribe

    on(
        events: string | string[],
        callback: EventCallback<any>,
        options: OnOptions = {}
    ): Unsubscribe {
        const { priority = DEFAULT_PRIORITY, owner = null } = options
        const normalized = this._normalizeEvents(events)

        normalized.forEach((event) => {
            this._addListener(event, { priority, callback, owner, next: null })
        })

        // Each call to `on` returns its own unique disposer. Calling it only
        // ever removes the single registration created in this call, even if
        // the same callback was registered multiple times.
        return () => {
            normalized.forEach((event) => {
                this._removeListenerByRef(event, callback)
            })
        }
    }

    once<TType extends keyof TEventMap & string>(
        events: TType | TType[],
        callback: EventCallback<EventPayload<TEventMap, TType>>,
        options?: OnOptions
    ): Unsubscribe

    once(
        events: string | string[],
        callback: EventCallback<any>,
        options?: OnOptions
    ): Unsubscribe

    once(
        events: string | string[],
        callback: EventCallback<any>,
        options: OnOptions = {}
    ): Unsubscribe {
        let unsubscribe: Unsubscribe

        const wrappedCallback: EventCallback<any> = (event) => {
            unsubscribe()
            return callback(event)
        }

        unsubscribe = this.on(events, wrappedCallback, options)
        return unsubscribe
    }

    /**
     * Remove a specific listener by its callback reference.
     * This is the safe, explicit removal path — only the exact registration
     * matching `callback` is removed; all other listeners are untouched.
     *
     * Prefer the `Unsubscribe` token returned by `on`/`once` over calling
     * this directly.
     */
    off(events: string | string[], callback: EventCallback<any>): void {
        this._normalizeEvents(events).forEach((event) => {
            this._removeListenerByRef(event, callback)
        })
    }

    /**
     * Remove **all** listeners registered under a given owner name.
     *
     * Intended for MFE unmount hooks — each micro-frontend tags its
     * listeners with `{ owner: "mfe-name" }` and calls `offOwner` on
     * teardown. Other MFEs' listeners are never affected.
     *
     * @example
     * // MFE-cart bootstrap:
     * bus.on("user.login",   syncCart,    { owner: "mfe-cart" });
     * bus.on("cart.updated", rerenderCart, { owner: "mfe-cart" });
     *
     * // MFE-cart teardown:
     * bus.offOwner("mfe-cart");
     */
    offOwner(owner: string): void {
        for (const event of Object.keys(this._listeners)) {
            this._removeListenersByOwner(event, owner)
        }
    }

    fire<TType extends keyof TEventMap & string>(
        type: TType,
        data?: EventPayload<TEventMap, TType>
    ): unknown
    fire(event: IBaseEvent): unknown
    fire(type: string, data?: Record<string, unknown>): unknown
    fire(
        typeOrEvent: string | IBaseEvent,
        data: Record<string, unknown> = {}
    ): unknown {
        let type: string
        let event: IBaseEvent & Record<string, unknown>

        if (typeof typeOrEvent === 'object') {
            type = typeOrEvent.type
            event = typeOrEvent as IBaseEvent & Record<string, unknown>
        } else {
            type = typeOrEvent
            const e = new BaseEvent(type)
            event = e.init(data) as IBaseEvent & Record<string, unknown>
        }

        let current: Listener | null = this._listeners[type] ?? null
        if (!current) return undefined

        let returnValue: unknown

        while (current !== null) {
            const result = current.callback(event)
            if (result !== undefined) returnValue = result

            current = current.next

            if (event.cancelBubble) break
        }

        return returnValue !== undefined
            ? returnValue
            : event.defaultPrevented
              ? false
              : undefined
    }

    handleError(error: Error): boolean {
        const e = new BaseEvent('error')
        e.init({ error })
        return this.fire(e) === false
    }

    private _normalizeEvents(events: string | string[]): string[] {
        return Array.isArray(events) ? events : [events]
    }

    private _addListener(event: string, newNode: Listener): void {
        const head = this._listeners[event]

        if (!head) {
            this._listeners[event] = newNode
            return
        }

        let current: Listener | null = head
        let prev: Listener | null = null

        while (current !== null && current.priority >= newNode.priority) {
            prev = current
            current = current.next
        }

        newNode.next = current

        if (prev === null) {
            this._listeners[event] = newNode
        } else {
            prev.next = newNode
        }
    }

    private _removeListenerByRef(
        event: string,
        callback: EventCallback<any>
    ): void {
        let current = this._listeners[event]
        let prev: Listener | null = null

        while (current !== null) {
            if (current.callback === callback) {
                if (prev !== null) {
                    prev.next = current.next
                } else {
                    this._listeners[event] = current.next
                }
                return
            }

            prev = current
            current = current.next
        }
    }

    private _removeListenersByOwner(event: string, owner: string): void {
        let current = this._listeners[event]
        let prev: Listener | null = null

        while (current !== null) {
            if (current.owner === owner) {
                const next = current.next

                if (prev !== null) {
                    prev.next = next
                } else {
                    this._listeners[event] = next
                }

                current = next
            } else {
                prev = current
                current = current.next
            }
        }
    }
}
