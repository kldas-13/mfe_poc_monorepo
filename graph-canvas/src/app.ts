/**
 * src/app.ts — Graph Canvas MFE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURE IN THIS FILE
 * ──────────────────────────
 *
 *  ┌─────────────────────────────────────────────────────────┐
 *  │  BFF (:3001)                                            │
 *  │    SSE  /api/graph/events  →  graph:init, graph:metrics │
 *  │    WS   /ws                →  same events + pong        │
 *  └──────────────────┬──────────────────────────────────────┘
 *                     │ data
 *  ┌──────────────────▼──────────────────────────────────────┐
 *  │  Graphology Graph  (client-side store)                  │
 *  │    Single source of truth for topology + live metrics   │
 *  │    graph:init    → addNode / addEdge                    │
 *  │    graph:metrics → setNodeAttribute (size, color)       │
 *  └──────────────────┬──────────────────────────────────────┘
 *                     │ read-only subscription
 *  ┌──────────────────▼──────────────────────────────────────┐
 *  │  Sigma.js renderer                                      │
 *  │    Reads from Graphology automatically on each frame    │
 *  │    renderer.refresh()  after every store mutation       │
 *  └──────────────────┬──────────────────────────────────────┘
 *                     │ events
 *  ┌──────────────────▼──────────────────────────────────────┐
 *  │  window.__UC_BUS  (EventBus from meta-shell)            │
 *  │    emit graph:topology-loaded  after first render       │
 *  │    emit graph:node-clicked     on user interaction      │
 *  │    emit graph:metrics-updated  on every metrics push    │
 *  └─────────────────────────────────────────────────────────┘
 *
 * QIANKUN LIFECYCLE
 * ──────────────────
 *   bootstrap()  — nothing (all setup happens in mount)
 *   mount(props) — receives container HTMLElement, mode, eventBus from shell
 *   unmount()    — closes SSE/WS, kills Sigma, removes DOM nodes
 *
 * IMPORTANT: The MFE always calls the BFF with ABSOLUTE URLs
 * (http://localhost:3001/...) because when embedded in qiankun,
 * the execution context is the shell's origin (port 5173), not port 5174.
 * Relative URLs would hit the shell's server, not this MFE's BFF.
 *
 * STANDALONE MODE
 * ────────────────
 * If window.__POWERED_BY_QIANKUN__ is false (running npm run dev:mfe
 * directly), the app mounts into <div id="app"> in index.html with
 * mode='full'. Useful for isolated development of this MFE.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Graph from 'graphology'
import circular from 'graphology-layout/circular'
import fa2 from 'graphology-layout-forceatlas2'
import Sigma from 'sigma'
import { renderWithQiankun, qiankunWindow } from 'vite-plugin-qiankun/dist/helper'

// ─── Config ───────────────────────────────────────────────────────────────────
// Always use absolute URL — see note above about qiankun execution context.

const BFF = 'http://localhost:3001'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string
  label: string
  group: 'shell' | 'bff' | 'mfe' | 'lib' | 'infra'
  weight: number
}

interface GraphEdge {
  id: string
  source: string
  target: string
  label: string
}

interface Topology { nodes: GraphNode[]; edges: GraphEdge[] }

interface Metric {
  nodeId: string
  rps: number
  latencyMs: number
  errorRate: number
}

// Node color by group
const GROUP_COLOR: Record<string, string> = {
  shell: '#6366f1',   // indigo
  bff: '#f59e0b',   // amber
  mfe: '#10b981',   // emerald
  lib: '#3b82f6',   // blue
  infra: '#ec4899',   // pink
}

// ─── Module-level state ───────────────────────────────────────────────────────
// One set of these per mounted MFE instance.
// Cleared in unmount() so remounting is clean.

let graph: Graph | null = null
let renderer: Sigma | null = null
let sse: EventSource | null = null
let ws: WebSocket | null = null

// Unsubscribe functions for EventBus listeners registered during mount
const busUnsubs: Array<() => void> = []

// ─── Styles ───────────────────────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById('gc-styles')) return
  const s = document.createElement('style')
  s.id = 'gc-styles'
  s.textContent = `
    /* Wrapper fills whatever container qiankun gives us */
    .gc-root {
      position: relative;
      width: 100%;
      height: 100%;
      background: #0a0e1a;
      overflow: hidden;
      font-family: 'Inter', system-ui, sans-serif;
    }

    /* Sigma canvas — must fill the root absolutely */
    .gc-canvas {
      position: absolute;
      inset: 0;
    }

    /* Floating header — pointer-events:none so it doesn't block graph interaction */
    .gc-header {
      position: absolute;
      top: 0; left: 0; right: 0;
      z-index: 10;
      padding: 14px 18px;
      background: linear-gradient(to bottom, rgba(10,14,26,0.9) 0%, transparent 100%);
      pointer-events: none;
    }
    .gc-title {
      font-size: 14px;
      font-weight: 700;
      color: #f0f4ff;
    }
    .gc-subtitle {
      font-size: 11px;
      color: #475569;
      margin-top: 2px;
    }

    /* Legend — bottom-left */
    .gc-legend {
      position: absolute;
      bottom: 16px; left: 16px;
      z-index: 10;
      background: rgba(13,20,36,0.92);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 10px 13px;
      font-size: 11px;
    }
    .gc-legend-row {
      display: flex;
      align-items: center;
      gap: 7px;
      margin-bottom: 4px;
      color: #94a3b8;
    }
    .gc-legend-row:last-child { margin-bottom: 0; }
    .gc-dot {
      width: 9px; height: 9px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    /* Tooltip — follows the mouse */
    .gc-tooltip {
      position: absolute;
      z-index: 20;
      pointer-events: none;
      display: none;
      background: rgba(13,20,36,0.96);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 7px;
      padding: 8px 12px;
      font-size: 12px;
      color: #e2e8f0;
      min-width: 130px;
    }
    .gc-tooltip-name  { font-weight: 600; margin-bottom: 3px; }
    .gc-tooltip-group { color: #64748b; font-size: 11px; }
    .gc-tooltip-rps   { color: #10b981; margin-top: 4px; font-size: 11px; }

    /* Transport indicator — top-right */
    .gc-transport {
      position: absolute;
      top: 14px; right: 16px;
      z-index: 10;
      display: flex;
      gap: 10px;
    }
    .gc-badge {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      color: #475569;
      background: rgba(13,20,36,0.8);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 5px;
      padding: 3px 8px;
    }
    .gc-badge-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #1e293b;
    }
    .gc-badge-dot.live { background: #10b981; animation: gc-pulse 2s infinite; }
    @keyframes gc-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  `
  document.head.appendChild(s)
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function buildDOM(container: HTMLElement): {
  canvasEl: HTMLElement
  tooltipEl: HTMLElement
  subtitleEl: HTMLElement
  sseDotEl: HTMLElement
  wsDotEl: HTMLElement
} {
  container.innerHTML = `
    <div class="gc-root" id="gc-root">

      <div class="gc-header">
        <div class="gc-title">⬡ Service Topology Graph</div>
        <div class="gc-subtitle" id="gc-subtitle">Loading topology…</div>
      </div>

      <div class="gc-transport">
        <div class="gc-badge">
          <span class="gc-badge-dot" id="gc-sse-dot"></span>SSE
        </div>
        <div class="gc-badge">
          <span class="gc-badge-dot" id="gc-ws-dot"></span>WS
        </div>
      </div>

      <!-- Sigma mounts here — must be a plain div at full size -->
      <div class="gc-canvas" id="gc-canvas"></div>

      <div class="gc-legend">
        ${Object.entries(GROUP_COLOR).map(([g, c]) => `
          <div class="gc-legend-row">
            <span class="gc-dot" style="background:${c}"></span>
            ${g}
          </div>
        `).join('')}
        <div style="border-top:1px solid rgba(255,255,255,.07);margin-top:6px;padding-top:6px;font-size:10px;color:#334155">
          Drag · Scroll to zoom · Click node
        </div>
      </div>

      <div class="gc-tooltip" id="gc-tooltip">
        <div class="gc-tooltip-name"  id="gc-tt-name"></div>
        <div class="gc-tooltip-group" id="gc-tt-group"></div>
        <div class="gc-tooltip-rps"   id="gc-tt-rps"></div>
      </div>

    </div>
  `

  return {
    canvasEl: container.querySelector<HTMLElement>('#gc-canvas')!,
    tooltipEl: container.querySelector<HTMLElement>('#gc-tooltip')!,
    subtitleEl: container.querySelector<HTMLElement>('#gc-subtitle')!,
    sseDotEl: container.querySelector<HTMLElement>('#gc-sse-dot')!,
    wsDotEl: container.querySelector<HTMLElement>('#gc-ws-dot')!,
  }
}

// ─── Graphology — populate / update the store ─────────────────────────────────

/**
 * Apply a topology snapshot into the Graphology store.
 * Safe to call multiple times — nodes/edges already present are skipped.
 */
function applyTopology(g: Graph, topo: Topology): void {
  for (const n of topo.nodes) {
    if (g.hasNode(n.id)) continue
    g.addNode(n.id, {
      label: n.label,
      group: n.group,
      color: GROUP_COLOR[n.group] ?? '#64748b',
      size: Math.max(6, n.weight * 2.2),
      // ForceAtlas2 will compute real positions; start on a circle
      x: Math.random(),
      y: Math.random(),
      // Extra attrs for the tooltip
      _rps: 0,
      _latencyMs: 0,
      _errorRate: 0,
    })
  }

  for (const e of topo.edges) {
    if (g.hasEdge(e.source, e.target)) continue
    if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue
    g.addEdge(e.source, e.target, {
      label: e.label,
      size: 1.5,
      color: '#1e293b',
    })
  }
}

/**
 * Apply live metrics to the Graphology store.
 * Mutating node attributes is all we need — Sigma re-renders on next frame.
 */
function applyMetrics(g: Graph, metrics: Metric[], r: Sigma): void {
  let changed = false
  for (const m of metrics) {
    if (!g.hasNode(m.nodeId)) continue

    // Scale node size by RPS (capped so it doesn't go crazy)
    const base = g.getNodeAttribute(m.nodeId, 'size') as number
    const newSz = Math.max(6, Math.min(base + m.rps / 120, 22))
    g.setNodeAttribute(m.nodeId, 'size', newSz)

    // High error rate → node turns red
    const baseColor = GROUP_COLOR[g.getNodeAttribute(m.nodeId, 'group') as string] ?? '#64748b'
    g.setNodeAttribute(m.nodeId, 'color', m.errorRate > 0.03 ? '#ef4444' : baseColor)

    // Store metrics for tooltip
    g.setNodeAttribute(m.nodeId, '_rps', m.rps)
    g.setNodeAttribute(m.nodeId, '_latencyMs', m.latencyMs)
    g.setNodeAttribute(m.nodeId, '_errorRate', m.errorRate)
    changed = true
  }
  if (changed) r.refresh()
}

// ─── Layout — run ForceAtlas2 after adding all nodes ─────────────────────────

function computeLayout(g: Graph): void {
  // Spread nodes on a circle first so FA2 doesn't clump them all at origin
  circular.assign(g)
  fa2.assign(g, {
    iterations: 120,
    settings: {
      gravity: 1,
      scalingRatio: 6,
      slowDown: 8,
      barnesHutOptimize: true,
      barnesHutTheta: 0.6,
      linLogMode: false,
    },
  })
}

// ─── Sigma renderer ───────────────────────────────────────────────────────────

function createRenderer(g: Graph, el: HTMLElement): Sigma {
  return new Sigma(g, el, {
    allowInvalidContainer: true,
    defaultNodeColor: '#3b82f6',
    defaultEdgeColor: '#1e293b',
    renderEdgeLabels: true,
    labelColor: { color: '#94a3b8' },
    edgeLabelColor: { color: '#334155' },
    labelSize: 11,
    labelWeight: '500',
    labelDensity: 0.08,
    labelGridCellSize: 80,
    labelRenderedSizeThreshold: 5,
    defaultNodeType: 'circle',
  })
}

// Attach hover tooltip and click handler to Sigma
function bindInteraction(
  r: Sigma,
  g: Graph,
  tooltipEl: HTMLElement,
  onNodeClick: (nodeId: string, label: string, group: string) => void
): void {
  const ttName = document.getElementById('gc-tt-name')!
  const ttGroup = document.getElementById('gc-tt-group')!
  const ttRps = document.getElementById('gc-tt-rps')!

  r.on('enterNode', ({ node, event }) => {
    const a = g.getNodeAttributes(node)
    ttName.textContent = a['label'] as string
    ttGroup.textContent = `group: ${a['group']}`
    ttRps.textContent = `${a['_rps']} rps · ${a['_latencyMs']} ms`
    tooltipEl.style.display = 'block'
    tooltipEl.style.left = `${(event.x) + 14}px`
    tooltipEl.style.top = `${(event.y) + 14}px`
  })


  r.on('leaveNode', () => {
    tooltipEl.style.display = 'none'
  })

  r.on('clickNode', ({ node }) => {
    const a = g.getNodeAttributes(node)
    onNodeClick(node, a['label'] as string, a['group'] as string)
  })
}

// ─── BFF connections ──────────────────────────────────────────────────────────

function openSSE(
  g: Graph,
  r: Sigma,
  subtitleEl: HTMLElement,
  dotEl: HTMLElement,
  onMetrics: (metrics: Metric[]) => void
): EventSource {
  const es = new EventSource(`${BFF}/api/graph/events`)

  es.onopen = () => { dotEl.className = 'gc-badge-dot live' }
  es.onerror = () => { dotEl.className = 'gc-badge-dot' }

  // Full topology on connect — populate the store and render
  es.addEventListener('graph:init', (e: MessageEvent) => {
    const topo: Topology = JSON.parse(e.data)
    applyTopology(g, topo)
    computeLayout(g)
    r.refresh()
    subtitleEl.textContent =
      `${g.order} nodes · ${g.size} edges · Graphology + ForceAtlas2 + Sigma.js`
    window.__UC_BUS?.emit('graph:topology-loaded', {
      nodeCount: g.order,
      edgeCount: g.size,
    })
  })

  // Live metrics — update the store, Sigma auto-re-renders
  es.addEventListener('graph:metrics', (e: MessageEvent) => {
    const { metrics }: { metrics: Metric[] } = JSON.parse(e.data)
    applyMetrics(g, metrics, r)
    onMetrics(metrics)
  })

  return es
}

function openWS(
  g: Graph,
  r: Sigma,
  dotEl: HTMLElement,
  onMetrics: (metrics: Metric[]) => void
): WebSocket {
  const socket = new WebSocket(`ws://localhost:3001/ws`)

  socket.onopen = () => {
    dotEl.className = 'gc-badge-dot live'
    // Keep-alive ping every 25 s
    const ping = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping', id: crypto.randomUUID() }))
      } else {
        clearInterval(ping)
      }
    }, 25_000)
  }

  socket.onclose = () => { dotEl.className = 'gc-badge-dot' }

  socket.onmessage = (e: MessageEvent) => {
    try {
      const msg: { type: string; data: unknown } = JSON.parse(e.data)

      if (msg.type === 'graph:init') {
        // WS also delivers graph:init — safe to apply again (idempotent)
        applyTopology(g, msg.data as Topology)
        r.refresh()
      }

      if (msg.type === 'graph:metrics') {
        const { metrics } = msg.data as { metrics: Metric[] }
        applyMetrics(g, metrics, r)
        onMetrics(metrics)
      }
    } catch { /* ignore malformed */ }
  }

  return socket
}

// ─── Mount / unmount ──────────────────────────────────────────────────────────

type MountProps = {
  container?: HTMLElement
  mode?: 'card' | 'full'
  eventBus?: typeof window.__UC_BUS
}

async function mountApp(props: MountProps): Promise<void> {
  // qiankun passes props.container when the app is embedded in the shell.
  // In standalone mode we fall back to #app in index.html.
  const container = (props.container
    ? (props.container.querySelector('#app') ?? props.container)
    : document.getElementById('app')) as HTMLElement

  if (!container) {
    console.error('[graph-canvas] no container element found')
    return
  }

  injectStyles()
  const { canvasEl, tooltipEl, subtitleEl, sseDotEl, wsDotEl } = buildDOM(container)

  // ── Graphology store ────────────────────────────────────────────────────
  graph = new Graph({ multi: false, type: 'directed' })

  // Bootstrap from REST first — fast initial render before SSE delivers
  try {
    const res = await fetch(`${BFF}/api/graph/topology`)
    const topo: Topology = await res.json()
    applyTopology(graph, topo)
    computeLayout(graph)
  } catch (err) {
    console.warn('[graph-canvas] REST topology failed, waiting for SSE', err)
    subtitleEl.textContent = 'Waiting for BFF on :3001…'
  }

  // ── Sigma renderer ──────────────────────────────────────────────────────
  renderer = createRenderer(graph, canvasEl)

  // Update subtitle once we have data
  if (graph.order > 0) {
    subtitleEl.textContent =
      `${graph.order} nodes · ${graph.size} edges · Graphology + ForceAtlas2 + Sigma.js`
    window.__UC_BUS?.emit('graph:topology-loaded', {
      nodeCount: graph.order,
      edgeCount: graph.size,
    })
  }

  // ── Interactions → EventBus ─────────────────────────────────────────────
  bindInteraction(renderer, graph, tooltipEl, (nodeId, label, group) => {
    window.__UC_BUS?.emit('graph:node-clicked', { nodeId, label, group })
  })

  // Metrics handler — emits to bus after updating the store
  const handleMetrics = (metrics: Metric[]) => {
    window.__UC_BUS?.emit('graph:metrics-updated', { metrics })
  }

  // ── Live data streams ───────────────────────────────────────────────────
  sse = openSSE(graph, renderer, subtitleEl, sseDotEl, handleMetrics)
  ws = openWS(graph, renderer, wsDotEl, handleMetrics)
}

function unmountApp(): void {
  // Close live connections
  sse?.close()
  ws?.close()
  sse = ws = null

  // Kill Sigma (removes canvas, event listeners, animation loop)
  renderer?.kill()
  renderer = null

  // Drop Graphology store
  graph = null

  // Unsubscribe any EventBus listeners this MFE registered
  busUnsubs.splice(0).forEach((fn) => fn())
}

// ─── qiankun lifecycle exports ───────────────────────────────────────────────
// vite-plugin-qiankun wires these up to the global scope automatically.

renderWithQiankun({
  bootstrap: async () => { },
  mount: async (props: any) => {
    await new Promise<void>((r) => requestAnimationFrame(() => r()))
    await mountApp(props as MountProps)
  },
  unmount: async (_props: any) => {
    unmountApp()
  },
  update: async (_props: any) => { }
})

// ─── Standalone mode ──────────────────────────────────────────────────────────
// __POWERED_BY_QIANKUN__ is false when running npm run dev:mfe directly.

if (!(window as any).__POWERED_BY_QIANKUN__) {
  const el = document.getElementById('app')
  if (el) {
    el.style.cssText = 'height:100vh;overflow:hidden;'
    mountApp({ mode: 'full' })
  }
}
