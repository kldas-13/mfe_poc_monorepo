import './components/micro-app-loader'
import './style.css'
import { Router } from './routers'
import './qaikun'

// ── Wire up nav links ──────────────────────────────────────────────────────────
document.querySelectorAll<HTMLElement>('[data-route]').forEach((link) => {
    link.addEventListener('click', (e) => {
        e.preventDefault()
        const route = (e.currentTarget as HTMLElement).dataset.route
        if (route) {
            Router.navigateTo(route)
            const container = document.getElementById('load-app')

            if (container) {
                if (route === '/') {
                    container.innerHTML = `<micro-app-loader
                        style="width: 1000px; height: 100px"
                        class="bg-red-200"
                        app-name="cart-app"
                        entry="http://localhost:3002"
                    >
                    </micro-app-loader>`
                } else {
                    container.innerHTML = ''
                }
            }
        }
    })
})

// Initial highlight
Router.syncNavHighlight()
