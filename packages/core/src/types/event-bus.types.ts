export interface IBaseEvent<TType extends string = string> {
    readonly type: TType
    cancelBubble: boolean
    defaultPrevented: boolean
    stopPropagation(): void
    preventDefault(): void
}

export type EventPayload<TMap, TType extends keyof TMap> =
    TMap[TType] extends Record<string, unknown>
        ? TMap[TType]
        : Record<string, unknown>

export type EventCallback<
    TPayload extends Record<string, unknown> = Record<string, unknown>,
> = (event: IBaseEvent & TPayload) => unknown

export interface Listener {
    priority: number
    callback: EventCallback<any>
    owner: string | null
    next: Listener | null
}

export type Unsubscribe = () => void

export interface OnOptions {
    /**
     * Higher number = runs first. Default: 1000.
     */
    priority?: number
    /**
     * Tag this listener with an owner name (e.g. "mfe-cart").
     * Enables bulk removal via `bus.offOwner("mfe-cart")`.
     */
    owner?: string
}
