import { IBaseEvent } from '@meta-ux/types'

export class BaseEvent<
    TType extends string = string,
    TPayload extends Record<string, unknown> = Record<string, unknown>,
> implements IBaseEvent<TType> {
    readonly type: TType
    cancelBubble = false
    defaultPrevented = false

    constructor(type: TType) {
        this.type = type
    }

    stopPropagation(): void {
        this.cancelBubble = true
    }

    preventDefault(): void {
        this.defaultPrevented = true
    }

    init(data: TPayload): this & TPayload {
        return Object.assign(this, data)
    }
}
