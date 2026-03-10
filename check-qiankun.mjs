import { chromium } from 'playwright'

async function check() {
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.goto('http://localhost:5174/')

    // Wait for scripts to execute
    await page.waitForTimeout(2000)

    const qiankunData = await page.evaluate(() => {
        return {
            windowKeys: Object.keys(window).filter(k => k.includes('qiankun') || k.includes('graph')),
            graphCanvas: typeof window['graph-canvas'],
            hasBootstrap: window['graph-canvas'] ? !!window['graph-canvas'].bootstrap : false
        }
    })

    console.log('Qiankun injection check:')
    console.log(qiankunData)

    await browser.close()
}

check().catch(console.error)
