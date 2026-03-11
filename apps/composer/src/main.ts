import './style.css'
import { navigateTo, syncNavHighlight } from './routers'
import './qaikun'

// ── Wire up nav links ──────────────────────────────────────────────────────────
document.querySelectorAll<HTMLElement>('[data-route]').forEach((link) => {
    link.addEventListener('click', (e) => {
        e.preventDefault()
        const route = (e.currentTarget as HTMLElement).dataset.route
        if (route) navigateTo(route)
    })
})

// Initial highlight
syncNavHighlight()
