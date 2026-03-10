type Handler<T = unknown> = (payload: T) => void

const listeners = new Map<string, Handler[]>()

export const eventBus = {
  on<T>(event: string, handler: Handler<T>) {
    if (!listeners.has(event)) listeners.set(event, [])
    listeners.get(event)!.push(handler as Handler)
  },
  emit<T>(event: string, payload: T) {
    listeners.get(event)?.forEach(h => h(payload))
  },
  off(event: string) {
    listeners.delete(event)
  },
}
