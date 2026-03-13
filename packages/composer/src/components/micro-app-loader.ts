import { loadMicroApp, type MicroApp } from 'qiankun'
import { registerElement } from '@meta-ux/core'

export class MicroAppLoader extends HTMLElement {
    private _microApp: MicroApp | null = null
    private _props: Record<string, unknown> = {}
    private _mounting = false
    private _connected = false
    private _mountSlot: HTMLDivElement | null = null

    static get observedAttributes(): string[] {
        return ['app-name', 'entry']
    }

    get props(): Record<string, unknown> {
        return this._props
    }

    set props(value: Record<string, unknown>) {
        this._props = value ?? {}
        if (this._microApp && !this._mounting) {
            this._microApp.update?.({ ...this._props })
        }
    }

    connectedCallback(): void {
        this._connected = true

        if (!this._mountSlot) {
            this._mountSlot = document.createElement('div')
            this._mountSlot.style.cssText = 'width:100%;height:100%;'
            this.appendChild(this._mountSlot)
        }

        if (!this._microApp) {
            this._mount()
        }
    }

    disconnectedCallback(): void {
        this._connected = false
        this._unmount()
    }

    attributeChangedCallback(
        _name: string,
        prev: string | null,
        next: string | null
    ): void {
        if (!this._connected) return
        if (prev === next) return

        this._unmount()
        this._mount()
    }

    private async _mount(): Promise<void> {
        const appName = this.getAttribute('app-name')
        const entry = this.getAttribute('entry')

        if (!appName || !entry || !this._mountSlot) return
        if (this._mounting) return

        this._mounting = true

        try {
            this._microApp = loadMicroApp(
                {
                    name: appName,
                    entry,
                    container: this._mountSlot,
                    props: { ...this._props, loadedFrom: 'loadMicroApp' },
                },
                {
                    sandbox: {
                        strictStyleIsolation: false,
                        experimentalStyleIsolation: false,
                    },
                }
            )

            await this._microApp.mountPromise

            this.dispatchEvent(
                new CustomEvent('micro-app-mounted', { bubbles: true })
            )
        } catch (err) {
            console.error(
                `[micro-app-loader] failed to mount "${appName}":`,
                err
            )
            this.dispatchEvent(
                new CustomEvent('micro-app-error', {
                    bubbles: true,
                    detail: { error: err },
                })
            )
        } finally {
            this._mounting = false
        }
    }

    private _unmount(): void {
        if (!this._microApp) return
        this._microApp.unmount()
        this._microApp = null
        this.dispatchEvent(
            new CustomEvent('micro-app-unmounted', { bubbles: true })
        )
    }
}

export function registerMicroAppLoader() {
    registerElement('micro-app-loader', MicroAppLoader)
}
