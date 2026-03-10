import { chromium } from 'playwright'

async function check() {
    const browser = await chromium.launch()
    const page = await browser.newPage()

    page.on('console', msg => {
        if (msg.type() === 'error' || msg.type() === 'warning') {
            console.log(`[Browser ${msg.type()}] ${msg.text()}`)
        }
    })

    page.on('pageerror', error => {
        console.log(`[Browser Exception] ${error.message}`)
    })

    await page.goto('http://localhost:5173/')

    console.log('--- Clicking Overview ---')
    await page.click('button[data-page="overview"]')

    await page.waitForTimeout(5000)

    console.log('--- Checking DOM ---')
    const html = await page.evaluate(() => {
        const g = document.getElementById('mount-overview-graph')?.innerHTML || 'graph missing'
        const b = document.getElementById('mount-overview-bpmn')?.innerHTML || 'bpmn missing'
        return { graph: g.substring(0, 150), bpmn: b.substring(0, 150) }
    })
    console.log(html)

    await browser.close()
}

check().catch(console.error)
