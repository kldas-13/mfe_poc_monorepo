/**
 * main.ts — Meta Shell entry point
 */

import { loadMicroApp, start, addGlobalUncaughtErrorHandler } from 'qiankun'
import type { MicroApp } from 'qiankun'
import { setBootstrapMaxTime, setMountMaxTime, setUnmountMaxTime } from 'single-spa'
import { bus } from './eventbus'   // side-effect: sets window.__UC_BUS

window.__UC_BUS = bus

// ─── Config ───────────────────────────────────────────────────────────────────

const META_BFF = 'http://localhost:3000'
const GRAPH_URL = 'http://localhost:5174/index.html'
const BPMN_URL = 'http://localhost:5175/index.html'

type Page = 'dashboard' | 'overview' | 'graph' | 'bpmn'

interface ServiceRecord {
  id: string
  name: string
  port: number
  status: 'healthy' | 'degraded' | 'down' | 'unknown'
  latencyMs: number
  requestsPerMin: number
}

interface DashboardSnapshot {
  services: ServiceRecord[]
  systemHealth: string
  ts: number
}

// ─── Runtime state ────────────────────────────────────────────────────────────

let activePage: Page = 'dashboard'
let appCounter = 0
const apps = new Map<string, MicroApp>()
let sse: EventSource | null = null
let ws: WebSocket | null = null

// ─── Styles ───────────────────────────────────────────────────────────────────

function injectStyles(): void {
  const el = document.createElement('style')
  el.textContent = `
    /* ── Layout ─────────────────────────────────────── */
    #root {
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

    /* ── Sidebar ─────────────────────────────────────── */
    #sidebar {
      width: 200px;
      flex-shrink: 0;
      background: #0d1424;
      border-right: 1px solid rgba(255,255,255,0.07);
      display: flex;
      flex-direction: column;
    }
    .brand {
      padding: 20px 18px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      font-size: 15px;
      font-weight: 800;
      color: #f0f4ff;
      letter-spacing: -0.3px;
      user-select: none;
    }
    .brand b { color: #3b82f6; }
    .nav { flex: 1; padding: 10px 8px; }
    .nav-btn {
      display: flex;
      align-items: center;
      gap: 9px;
      width: 100%;
      padding: 10px 11px;
      border: none;
      border-radius: 7px;
      background: transparent;
      color: #64748b;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      text-align: left;
      margin-bottom: 2px;
      transition: background 0.12s, color 0.12s;
    }
    .nav-btn:hover  { background: #1e293b; color: #e2e8f0; }
    .nav-btn.active { background: rgba(59,130,246,0.14); color: #93c5fd; }

    /* ── Content ─────────────────────────────────────── */
    #content {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    /* ── Pages ───────────────────────────────────────── */
    .page {
      display: none;
      flex: 1;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }
    .page.active { display: flex; }

    .page-header {
      padding: 18px 26px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      flex-shrink: 0;
    }
    .page-header h1 { font-size: 19px; font-weight: 700; color: #f0f4ff; }
    .page-header p  { font-size: 12px; color: #475569; margin-top: 3px; }

    /* ── Dashboard ───────────────────────────────────── */
    #dash-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 18px 26px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .kpi-row {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .kpi {
      background: #111827;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 9px;
      padding: 14px 18px;
      min-width: 100px;
    }
    .kpi-value { font-size: 26px; font-weight: 700; color: #f0f4ff; }
    .kpi-label { font-size: 11px; color: #475569; margin-top: 2px; }
    .transports { margin-left: auto; display: flex; gap: 14px; }
    .tport { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #475569; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #1e293b; flex-shrink: 0; }
    .dot.live { background: #10b981; animation: pulse 2s infinite; }
    @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.3;} }
    .section-title {
      font-size: 11px; font-weight: 600; color: #334155;
      text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 10px;
    }
    .svc-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 10px;
    }
    .svc-card {
      background: #111827;
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 9px;
      padding: 14px;
    }
    .svc-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
    .svc-name { font-size: 13px; font-weight: 600; color: #e2e8f0; }
    .svc-port { font-size: 11px; color: #475569; margin-top: 2px; }
    .svc-stats { display: flex; gap: 16px; }
    .metric-v { font-size: 17px; font-weight: 700; color: #f0f4ff; }
    .metric-l { font-size: 10px; color: #475569; margin-top: 1px; }
    .pill { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.04em; }
    .pill-healthy  { color:#10b981; background:rgba(16,185,129,.10); border:1px solid rgba(16,185,129,.25); }
    .pill-degraded { color:#f59e0b; background:rgba(245,158,11,.10); border:1px solid rgba(245,158,11,.25); }
    .pill-down     { color:#ef4444; background:rgba(239,68,68,.10);  border:1px solid rgba(239,68,68,.25);  }
    .pill-unknown  { color:#64748b; background:rgba(100,116,139,.10);border:1px solid rgba(100,116,139,.25);}
    .log-box {
      background: rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.07);
      border-radius: 8px; padding: 10px; max-height: 180px; overflow-y: auto;
      font-family: 'Courier New', monospace; font-size: 11px; flex-shrink: 0;
    }
    .log-row { padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,.04); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .log-ts    { color: #10b981; margin-right: 8px; }
    .log-event { color: #60a5fa; margin-right: 6px; }
    .log-body  { color: #475569; }

    /* ── Overview ────────────────────────────────────── */
    #overview-grid {
      flex: 1; min-height: 0;
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 14px; padding: 14px 22px 18px;
    }
    .canvas-card {
      background: #111827; border: 1px solid rgba(255,255,255,.07);
      border-radius: 12px; overflow: hidden;
      display: flex; flex-direction: column; min-height: 0;
    }
    .canvas-card-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,.07); flex-shrink: 0;
    }
    .canvas-card-title { font-size: 13px; font-weight: 600; color: #e2e8f0; }
    .canvas-body { flex: 1; min-height: 0; position: relative; }

    /* ── Full-screen MFE pages ───────────────────────── */
    .mfe-full { flex: 1; min-height: 0; position: relative; }

    /* ── Loading placeholder ─────────────────────────── */
    .placeholder {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 10px; color: #334155; font-size: 13px;
    }
    .spinner {
      width: 22px; height: 22px; border-radius: 50%;
      border: 2px solid #1e293b; border-top-color: #3b82f6;
      animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Scrollbar ───────────────────────────────────── */
    ::-webkit-scrollbar       { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
  `
  document.head.appendChild(el)
}

// ─── Layout HTML ──────────────────────────────────────────────────────────────

function buildLayout(): void {
  document.getElementById('root')!.innerHTML = `
    <nav id="sidebar">
      <div class="brand">⬡ <b>Unified</b> Canvas</div>
      <div class="nav">
        <button class="nav-btn active" data-page="dashboard"><span>⊞</span> Dashboard</button>
        <button class="nav-btn" data-page="overview"><span>⧉</span> Overview</button>
        <button class="nav-btn" data-page="graph"><span>⬡</span> Service Graph</button>
        <button class="nav-btn" data-page="bpmn"><span>◈</span> BPMN Canvas</button>
      </div>
    </nav>

    <div id="content">

      <!-- DASHBOARD -->
      <div id="page-dashboard" class="page active">
        <div class="page-header">
          <h1>System Dashboard</h1>
          <p>Live service health — meta-bff via SSE &amp; WebSocket on :3000</p>
        </div>
        <div id="dash-scroll">
          <div class="kpi-row">
            <div class="kpi"><div class="kpi-value" id="kpi-total">—</div><div class="kpi-label">services</div></div>
            <div class="kpi"><div class="kpi-value" id="kpi-healthy" style="color:#10b981">—</div><div class="kpi-label">healthy</div></div>
            <div class="kpi"><div class="kpi-value" id="kpi-issue" style="color:#f59e0b">—</div><div class="kpi-label">issues</div></div>
            <div class="transports">
              <div class="tport"><span class="dot" id="sse-dot"></span><span id="sse-lbl">SSE…</span></div>
              <div class="tport"><span class="dot" id="ws-dot"></span><span id="ws-lbl">WS…</span></div>
            </div>
          </div>
          <div>
            <div class="section-title">Services</div>
            <div class="svc-grid" id="svc-grid">
              <div style="color:#475569;font-size:13px;grid-column:1/-1;padding:8px 0">Waiting for meta-bff on :3000…</div>
            </div>
          </div>
          <div>
            <div class="section-title">Live Event Log</div>
            <div class="log-box" id="log-box">
              <div class="log-row"><span class="log-body">— waiting for events —</span></div>
            </div>
          </div>
        </div>
      </div>

      <!-- OVERVIEW -->
      <div id="page-overview" class="page">
        <div class="page-header">
          <h1>Canvas Overview</h1>
          <p>Both MFEs live simultaneously. Add more canvas cards as you add new repos.</p>
        </div>
        <div id="overview-grid">
          <div class="canvas-card">
            <div class="canvas-card-header">
              <span class="canvas-card-title">⬡ Service Graph</span>
              <span class="pill pill-healthy">live</span>
            </div>
            <div class="canvas-body" id="mount-overview-graph">
              <div class="placeholder"><div class="spinner"></div>Mounting…</div>
            </div>
          </div>
          <div class="canvas-card">
            <div class="canvas-card-header">
              <span class="canvas-card-title">◈ BPMN Canvas</span>
              <span class="pill pill-healthy">live</span>
            </div>
            <div class="canvas-body" id="mount-overview-bpmn">
              <div class="placeholder"><div class="spinner"></div>Mounting…</div>
            </div>
          </div>
        </div>
      </div>

      <!-- GRAPH full-screen -->
      <div id="page-graph" class="page">
        <div class="mfe-full" id="mount-graph-full">
          <div class="placeholder"><div class="spinner"></div>Mounting Graph MFE…</div>
        </div>
      </div>

      <!-- BPMN full-screen -->
      <div id="page-bpmn" class="page">
        <div class="mfe-full" id="mount-bpmn-full">
          <div class="placeholder"><div class="spinner"></div>Mounting BPMN MFE…</div>
        </div>
      </div>

    </div>
  `
}

// ─── qiankun helpers ──────────────────────────────────────────────────────────

function mountMfe(
  key: string,
  entry: string,
  selector: string,
  props: Record<string, unknown> = {}
): void {
  // The vite-plugin-qiankun configuration in the MFEs registers the lifecycle hooks
  // under the name '<key>-canvas' (e.g. 'graph-canvas', 'bpmn-canvas').
  // The name passed to loadMicroApp MUST match this exactly when sandbox is false.
  const name = `${key}-canvas`

  const app = loadMicroApp(
    {
      name,
      entry,
      container: selector,
      props: {
        ...props,
        eventBus: window.__UC_BUS,
      },
    },
    {
      // Disable sandbox in dev — it intercepts fetch/XHR and adds its own
      // Origin headers that conflict with Vite's CORS handling.
      // For production builds, set: sandbox: { strictStyleIsolation: true }
      sandbox: false,

      // Use native fetch directly so qiankun doesn't wrap it
      fetch: (url: RequestInfo | URL, init?: RequestInit) =>
        window.fetch(url, init),
    }
  )

  apps.set(key, app)

  app.mountPromise
    .then(() => bus.emit('mfe:ready', { name: key }))
    .catch((err: unknown) => {
      console.error(`[shell] failed to mount ${key}:`, err)
    })
}

async function unmountAll(): Promise<void> {
  await Promise.all(
    Array.from(apps.values()).map((a) => a.unmount().catch(console.warn))
  )
  apps.clear()
}

// ─── Navigation ───────────────────────────────────────────────────────────────

async function navigate(to: Page): Promise<void> {
  if (to === activePage) return

  await unmountAll()

  document.querySelectorAll<HTMLButtonElement>('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset['page'] === to)
  })

  document.querySelectorAll<HTMLElement>('.page').forEach((p) => {
    p.classList.remove('active')
  })
  document.getElementById(`page-${to}`)?.classList.add('active')

  activePage = to

  switch (to) {
    case 'overview':
      mountMfe('graph', GRAPH_URL, '#mount-overview-graph', { mode: 'card' })
      mountMfe('bpmn', BPMN_URL, '#mount-overview-bpmn', { mode: 'card' })
      break
    case 'graph':
      mountMfe('graph', GRAPH_URL, '#mount-graph-full', { mode: 'full' })
      break
    case 'bpmn':
      mountMfe('bpmn', BPMN_URL, '#mount-bpmn-full', { mode: 'full' })
      break
    case 'dashboard':
      break
  }
}

// ─── Dashboard — SSE ──────────────────────────────────────────────────────────

function startSSE(): void {
  sse?.close()
  const es = new EventSource(`${META_BFF}/api/events`)
  sse = es

  es.onopen = () => setTransport('sse', true)
  es.onerror = () => setTransport('sse', false)

  es.addEventListener('snapshot', (e: MessageEvent) => {
    try {
      const snap: DashboardSnapshot = JSON.parse(e.data)
      applySnapshot(snap)
      log('sse:snapshot', `health=${snap.systemHealth} svcs=${snap.services.length}`)
    } catch (err) {
      console.error('[shell] SSE parse error:', err)
    }
  })
}

// ─── Dashboard — WebSocket ────────────────────────────────────────────────────

function startWS(): void {
  ws?.close()
  const socket = new WebSocket(`ws://localhost:3000/ws`)
  ws = socket

  socket.onopen = () => {
    setTransport('ws', true)
    log('ws:open', 'connected to meta-bff :3000')
    const interval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping', id: crypto.randomUUID() }))
      } else {
        clearInterval(interval)
      }
    }, 25_000)
  }

  socket.onclose = () => {
    setTransport('ws', false)
    setTimeout(startWS, 3_000)
  }

  socket.onmessage = (e: MessageEvent) => {
    try {
      const msg: { type: string; data?: unknown } = JSON.parse(e.data)
      log(`ws:${msg.type}`, JSON.stringify(msg.data ?? '').slice(0, 90))
      if (msg.type === 'snapshot') {
        applySnapshot(msg.data as DashboardSnapshot)
      }
    } catch (err) {
      console.error('[shell] WS parse error:', err)
    }
  }

  socket.onerror = () => setTransport('ws', false)
}

// ─── Dashboard DOM helpers ────────────────────────────────────────────────────

function applySnapshot(snap: DashboardSnapshot): void {
  const svcs = snap.services ?? []
  setText('kpi-total', svcs.length)
  setText('kpi-healthy', svcs.filter((s) => s.status === 'healthy').length)
  setText('kpi-issue', svcs.filter((s) => s.status !== 'healthy').length)

  const grid = document.getElementById('svc-grid')
  if (!grid) return

  if (svcs.length === 0) {
    grid.innerHTML = `<div style="color:#475569;font-size:13px;grid-column:1/-1">No services returned.</div>`
    return
  }

  grid.innerHTML = svcs.map((s) => `
    <div class="svc-card">
      <div class="svc-top">
        <div>
          <div class="svc-name">${s.name}</div>
          <div class="svc-port">:${s.port}</div>
        </div>
        <span class="pill pill-${s.status}">${s.status}</span>
      </div>
      <div class="svc-stats">
        <div><div class="metric-v">${s.latencyMs}</div><div class="metric-l">ms</div></div>
        <div><div class="metric-v">${s.requestsPerMin}</div><div class="metric-l">req/min</div></div>
      </div>
    </div>
  `).join('')
}

function setTransport(type: 'sse' | 'ws', live: boolean): void {
  const dot = document.getElementById(`${type}-dot`)
  const lbl = document.getElementById(`${type}-lbl`)
  if (dot) dot.className = `dot${live ? ' live' : ''}`
  if (lbl) lbl.textContent = type.toUpperCase() + (live ? ': live' : ': offline')
}

function log(event: string, body: string): void {
  const box = document.getElementById('log-box')
  if (!box) return
  const row = document.createElement('div')
  row.className = 'log-row'
  const ts = new Date().toISOString().slice(11, 23)
  row.innerHTML = `<span class="log-ts">${ts}</span><span class="log-event">${event}</span><span class="log-body">${body}</span>`
  box.prepend(row)
  while (box.childElementCount > 80) box.lastElementChild?.remove()
}

function setText(id: string, val: string | number): void {
  const el = document.getElementById(id)
  if (el) el.textContent = String(val)
}

function wireBusToLog(): void {
  const toWatch = [
    'mfe:ready', 'graph:topology-loaded', 'graph:node-clicked',
    'graph:metrics-updated', 'bpmn:workflow-loaded', 'bpmn:step-changed',
  ]
  toWatch.forEach((evt) => {
    bus.on(evt, (data: unknown) => {
      log(`bus:${evt}`, JSON.stringify(data).slice(0, 100))
    })
  })
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function init(): void {
  injectStyles()
  buildLayout()

  document.getElementById('root')!.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-page]')
    if (btn?.dataset['page']) navigate(btn.dataset['page'] as Page)
  })

  // ── single-spa timeout config ──────────────────────────────────────────────
  // Override the default 4000 ms lifecycle timeouts. In dev mode MFEs take
  // longer because Vite serves un-bundled ESM with on-demand transpilation.
  // dieOnTimeout: false  → app stays in LOADING rather than SKIP_BECAUSE_BROKEN
  setBootstrapMaxTime(60000, false)
  setMountMaxTime(60000, false)
  setUnmountMaxTime(60000, false)

  // Start qiankun — configures single-spa and global error handler.
  // prefetch: false because we load MFEs on-demand via loadMicroApp.
  start({
    prefetch: false,
    sandbox: false,
  })

  // Suppress noisy single-spa errors in the console during dev
  addGlobalUncaughtErrorHandler((event) => {
    console.warn('[shell] qiankun global error (suppressed):', event)
  })

  startSSE()
  startWS()
  wireBusToLog()
}

init()
