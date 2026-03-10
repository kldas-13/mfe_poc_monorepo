/**
 * src/app.ts — BPMN Canvas MFE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ARCHITECTURE IN THIS FILE
 * ──────────────────────────
 *
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │  BFF (:3002)                                                     │
 *  │    REST  GET /api/workflows          → list                      │
 *  │    REST  GET /api/workflows/:id      → { id, name, xml }         │
 *  │    SSE   GET /api/workflows/:id/events                           │
 *  │            workflow:init     → load XML into bpmn-js             │
 *  │            workflow:step     → highlight active element          │
 *  │            workflow:complete → clear highlight                   │
 *  │            workflow:reset    → clear highlight, ready for next   │
 *  │    WS    ws://localhost:3002/ws  → same events + subscribe msg   │
 *  └────────────────────────────┬─────────────────────────────────────┘
 *                               │ data
 *  ┌────────────────────────────▼─────────────────────────────────────┐
 *  │  bpmn-js Viewer                                                  │
 *  │    importXML(xml)         → parse and render the diagram         │
 *  │    canvas.addMarker(id, 'active-step')   → green highlight       │
 *  │    canvas.removeMarker(id, 'active-step')→ remove highlight      │
 *  │    canvas.zoom('fit-viewport')           → auto-fit on load      │
 *  └────────────────────────────┬─────────────────────────────────────┘
 *                               │ events
 *  ┌────────────────────────────▼─────────────────────────────────────┐
 *  │  window.__UC_BUS  (EventBus from meta-shell)                     │
 *  │    emit bpmn:workflow-loaded   after importXML succeeds          │
 *  │    emit bpmn:step-changed      on every workflow:step event      │
 *  └──────────────────────────────────────────────────────────────────┘
 *
 * IMPORTANT NOTES ON bpmn-js
 * ───────────────────────────
 * 1. bpmn-js is a CommonJS library wrapped in ESM by Vite's optimizeDeps.
 *    Always import it as:  import BpmnViewer from 'bpmn-js/lib/Viewer'
 *    NOT 'bpmn-js' (that imports the full Modeler which is much larger).
 *
 * 2. The Viewer instance must be destroyed (viewer.destroy()) in unmount()
 *    or it leaks event listeners and the canvas element.
 *
 * 3. addMarker / removeMarker work on element IDs that match the BPMN XML.
 *    The BFF's steps[] array uses these same IDs.
 *
 * 4. CSS for the .active-step marker is injected by injectStyles().
 *    bpmn-js itself only applies a CSS class — we style it.
 *
 * ABSOLUTE BFF URL
 * ─────────────────
 * Always use http://localhost:3002 — relative URLs would hit the shell
 * when embedded in qiankun. See graph-canvas/src/app.ts for full note.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// bpmn-js Viewer — lighter than the full Modeler (no editing tools)
import BpmnViewer from 'bpmn-js/lib/Viewer'
import { qiankunWindow } from 'vite-plugin-qiankun/dist/helper'

// ─── Config ───────────────────────────────────────────────────────────────────

const BFF           = 'http://localhost:3002'
const DEFAULT_WF_ID = 'ml-pipeline'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkflowSummary {
  id:          string
  name:        string
  description: string
}

interface Workflow extends WorkflowSummary {
  xml:   string
  steps: string[]
}

interface StepEvent {
  workflowId:  string
  elementId:   string
  stepIndex:   number
  totalSteps:  number
  label:       string
  ts:          number
}

// ─── Module-level state ───────────────────────────────────────────────────────

let viewer:      InstanceType<typeof BpmnViewer> | null = null
let sse:         EventSource | null = null
let ws:          WebSocket   | null = null
let activeElemId: string | null = null   // currently highlighted element

const busUnsubs: Array<() => void> = []

// ─── Styles ───────────────────────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById('bc-styles')) return
  const s = document.createElement('style')
  s.id = 'bc-styles'
  s.textContent = `
    /* Root wrapper fills the qiankun container */
    .bc-root {
      position: relative;
      width: 100%; height: 100%;
      background: #0d1424;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: 'Inter', system-ui, sans-serif;
    }

    /* Toolbar strip */
    .bc-toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      flex-shrink: 0;
      background: #0d1424;
      z-index: 10;
    }
    .bc-title {
      font-size: 13px;
      font-weight: 700;
      color: #f0f4ff;
    }
    .bc-select {
      font-size: 12px;
      background: #1e293b;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 5px;
      color: #e2e8f0;
      padding: 4px 10px;
      cursor: pointer;
      font-family: inherit;
    }
    .bc-select:focus { outline: none; border-color: #3b82f6; }

    /* Transport badges */
    .bc-transports { margin-left: auto; display: flex; gap: 8px; }
    .bc-badge {
      display: flex; align-items: center; gap: 5px;
      font-size: 10px; color: #475569;
      background: #1e293b;
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 5px; padding: 3px 8px;
    }
    .bc-dot { width: 6px; height: 6px; border-radius: 50%; background: #334155; }
    .bc-dot.live { background: #10b981; animation: bc-pulse 2s infinite; }
    @keyframes bc-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

    /* Step progress bar */
    .bc-progress-wrap {
      padding: 6px 16px 4px;
      flex-shrink: 0;
      background: #0d1424;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .bc-progress-label {
      font-size: 10px;
      color: #475569;
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
    }
    .bc-progress-bar-bg {
      height: 3px;
      background: #1e293b;
      border-radius: 2px;
      overflow: hidden;
    }
    .bc-progress-bar-fill {
      height: 100%;
      background: #3b82f6;
      border-radius: 2px;
      transition: width 0.4s ease;
    }

    /* bpmn-js canvas area */
    .bc-canvas-wrap {
      flex: 1;
      position: relative;
      min-height: 0;
      overflow: hidden;
    }
    .bc-canvas {
      position: absolute;
      inset: 0;
    }

    /* Override bpmn-js default light theme to match dark shell */
    .bc-canvas .djs-container svg {
      background: #0d1424 !important;
    }
    .bc-canvas .djs-shape .djs-visual > :is(rect, circle, polygon) {
      fill: #1e293b !important;
      stroke: #334155 !important;
    }
    .bc-canvas .djs-shape .djs-visual text {
      fill: #94a3b8 !important;
    }
    .bc-canvas .djs-connection .djs-visual path {
      stroke: #334155 !important;
    }
    /* Highlight for the active step */
    .bc-canvas .djs-shape.active-step .djs-visual > :is(rect, circle, polygon) {
      fill:   rgba(16, 185, 129, 0.20) !important;
      stroke: #10b981 !important;
      stroke-width: 2.5px !important;
    }
    .bc-canvas .djs-shape.active-step .djs-visual text {
      fill: #10b981 !important;
      font-weight: 600 !important;
    }

    /* Status badge under the canvas */
    .bc-status {
      padding: 7px 16px;
      font-size: 11px;
      color: #475569;
      border-top: 1px solid rgba(255,255,255,0.06);
      flex-shrink: 0;
      display: flex;
      gap: 12px;
      align-items: center;
      background: #0d1424;
    }
    .bc-status-step { color: #10b981; font-weight: 600; }
    .bc-status-wf   { color: #3b82f6; }

    /* Spinner / error placeholder */
    .bc-placeholder {
      position: absolute; inset: 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 10px; color: #334155; font-size: 13px;
    }
    .bc-spinner {
      width: 22px; height: 22px; border-radius: 50%;
      border: 2px solid #1e293b; border-top-color: #3b82f6;
      animation: bc-spin 0.8s linear infinite;
    }
    @keyframes bc-spin { to { transform: rotate(360deg); } }
  `
  document.head.appendChild(s)
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

interface BcElements {
  canvasEl:       HTMLElement
  selectEl:       HTMLSelectElement
  sseDotEl:       HTMLElement
  wsDotEl:        HTMLElement
  progressFill:   HTMLElement
  progressLabel:  HTMLElement
  progressStep:   HTMLElement
  statusStep:     HTMLElement
  statusWf:       HTMLElement
}

function buildDOM(container: HTMLElement): BcElements {
  container.innerHTML = `
    <div class="bc-root" id="bc-root">

      <div class="bc-toolbar">
        <span class="bc-title">◈ BPMN Canvas</span>
        <select class="bc-select" id="bc-select">
          <option value="">Loading workflows…</option>
        </select>
        <div class="bc-transports">
          <div class="bc-badge"><span class="bc-dot" id="bc-sse-dot"></span>SSE</div>
          <div class="bc-badge"><span class="bc-dot" id="bc-ws-dot"></span>WS</div>
        </div>
      </div>

      <div class="bc-progress-wrap">
        <div class="bc-progress-label">
          <span id="bc-progress-label">Loading…</span>
          <span id="bc-progress-step"></span>
        </div>
        <div class="bc-progress-bar-bg">
          <div class="bc-progress-bar-fill" id="bc-progress-fill" style="width:0%"></div>
        </div>
      </div>

      <div class="bc-canvas-wrap">
        <!-- bpmn-js mounts here -->
        <div class="bc-canvas" id="bc-canvas">
          <div class="bc-placeholder">
            <div class="bc-spinner"></div>
            Loading workflow from BFF on :3002…
          </div>
        </div>
      </div>

      <div class="bc-status">
        <span>Active:</span>
        <span class="bc-status-step" id="bc-status-step">—</span>
        <span>Workflow:</span>
        <span class="bc-status-wf" id="bc-status-wf">—</span>
      </div>

    </div>
  `

  return {
    canvasEl:      container.querySelector<HTMLElement>('#bc-canvas')!,
    selectEl:      container.querySelector<HTMLSelectElement>('#bc-select')!,
    sseDotEl:      container.querySelector<HTMLElement>('#bc-sse-dot')!,
    wsDotEl:       container.querySelector<HTMLElement>('#bc-ws-dot')!,
    progressFill:  container.querySelector<HTMLElement>('#bc-progress-fill')!,
    progressLabel: container.querySelector<HTMLElement>('#bc-progress-label')!,
    progressStep:  container.querySelector<HTMLElement>('#bc-progress-step')!,
    statusStep:    container.querySelector<HTMLElement>('#bc-status-step')!,
    statusWf:      container.querySelector<HTMLElement>('#bc-status-wf')!,
  }
}

// ─── bpmn-js helpers ──────────────────────────────────────────────────────────

/**
 * Create a new BpmnViewer attached to canvasEl and import the XML.
 * Returns the viewer instance.
 */
async function loadDiagram(canvasEl: HTMLElement, xml: string): Promise<InstanceType<typeof BpmnViewer>> {
  // Destroy any previous viewer
  viewer?.destroy()
  viewer = null

  // Clear the loading placeholder
  canvasEl.innerHTML = ''

  const v = new BpmnViewer({ container: canvasEl })
  await v.importXML(xml)

  // Fit the diagram to the container on load
  const canvas = v.get('canvas') as { zoom(mode: string): void }
  canvas.zoom('fit-viewport')

  viewer = v
  return v
}

/**
 * Highlight elementId in the current viewer.
 * Removes the previous highlight first.
 */
function highlightStep(elementId: string): void {
  if (!viewer) return
  const canvas = viewer.get('canvas') as {
    addMarker(id: string, cls: string): void
    removeMarker(id: string, cls: string): void
  }

  // Remove previous highlight
  if (activeElemId) {
    try { canvas.removeMarker(activeElemId, 'active-step') } catch { /* element may not exist */ }
  }

  // Add new highlight
  try {
    canvas.addMarker(elementId, 'active-step')
    activeElemId = elementId
  } catch {
    // element not in diagram — skip silently
  }
}

function clearHighlight(): void {
  if (!viewer || !activeElemId) return
  const canvas = viewer.get('canvas') as { removeMarker(id: string, cls: string): void }
  try { canvas.removeMarker(activeElemId, 'active-step') } catch { /* ok */ }
  activeElemId = null
}

// ─── Workflow select ──────────────────────────────────────────────────────────

async function populateSelect(selectEl: HTMLSelectElement): Promise<void> {
  try {
    const res  = await fetch(`${BFF}/api/workflows` , {
  method: 'GET',
  headers: { 'Accept': 'application/json' },
  credentials: 'omit', 
})
    const list: WorkflowSummary[] = await res.json()
    selectEl.innerHTML = list
      .map((w) => `<option value="${w.id}">${w.name}</option>`)
      .join('')
  } catch {
    selectEl.innerHTML = `<option value="${DEFAULT_WF_ID}">ML Pipeline (default)</option>`
  }
}

// ─── BFF connections ──────────────────────────────────────────────────────────

function openSSE(
  workflowId: string,
  els: BcElements,
): EventSource {
  sse?.close()

  const es = new EventSource(`${BFF}/api/workflows/${workflowId}/events`)

  es.onopen  = () => { els.sseDotEl.className = 'bc-dot live' }
  es.onerror = () => { els.sseDotEl.className = 'bc-dot' }

  // Full workflow + XML on connect → render the diagram immediately
  es.addEventListener('workflow:init', async (e: MessageEvent) => {
    const { workflow }: { workflow: Workflow } = JSON.parse(e.data)
    els.statusWf.textContent = workflow.name

    try {
      await loadDiagram(els.canvasEl, workflow.xml)
      window.__UC_BUS?.emit('bpmn:workflow-loaded', {
        workflowId: workflow.id,
        name:       workflow.name,
      })
    } catch (err) {
      console.error('[bpmn-canvas] importXML failed:', err)
      els.canvasEl.innerHTML = `<div class="bc-placeholder" style="color:#ef4444">⚠ Failed to render diagram</div>`
    }
  })

  // Step transition → highlight active element
  es.addEventListener('workflow:step', (e: MessageEvent) => {
    const { step }: { step: StepEvent } = JSON.parse(e.data)

    highlightStep(step.elementId)

    // Update progress bar
    const pct = Math.round(((step.stepIndex + 1) / step.totalSteps) * 100)
    els.progressFill.style.width  = `${pct}%`
    els.progressLabel.textContent = step.label
    els.progressStep.textContent  = `${step.stepIndex + 1} / ${step.totalSteps}`
    els.statusStep.textContent    = step.elementId

    window.__UC_BUS?.emit('bpmn:step-changed', {
      from: activeElemId ?? '',
      to:   step.elementId,
      ts:   step.ts,
    })
  })

  // Complete / reset → clear the highlight
  es.addEventListener('workflow:complete', () => {
    clearHighlight()
    els.progressLabel.textContent = 'Pipeline complete ✓'
    els.progressFill.style.width  = '100%'
    els.statusStep.textContent    = 'complete'
  })

  es.addEventListener('workflow:reset', () => {
    clearHighlight()
    els.progressFill.style.width  = '0%'
    els.progressLabel.textContent = 'Restarting…'
    els.progressStep.textContent  = ''
    els.statusStep.textContent    = '—'
  })

  return es
}

function openWS(els: BcElements): WebSocket {
  ws?.close()
  const socket = new WebSocket(`ws://localhost:3002/ws`)

  socket.onopen = () => {
    els.wsDotEl.className = 'bc-dot live'
    // Send a keepalive ping every 25 s
    const ping = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping', id: crypto.randomUUID() }))
      } else {
        clearInterval(ping)
      }
    }, 25_000)
  }

  socket.onclose = () => { els.wsDotEl.className = 'bc-dot' }

  socket.onmessage = (e: MessageEvent) => {
    try {
      const msg: { type: string; data?: unknown } = JSON.parse(e.data)

      // WS mirrors all SSE events — we only need to handle step here
      // because SSE already drives the highlight. If you want to use WS
      // as the sole transport, replicate the SSE handler logic here.
      if (msg.type === 'workflow:step') {
        const { step } = msg.data as { step: StepEvent }
        // Only log to bus from WS to avoid double-emit with SSE
        // (In production, pick ONE transport as the authoritative source)
        _(step) // acknowledge receipt — SSE handles the actual highlight
      }
    } catch { /* ignore malformed */ }
  }

  return socket
}

// silence unused var lint warning
const _ = (_x: unknown) => {}

// ─── Workflow switcher ────────────────────────────────────────────────────────

function switchWorkflow(workflowId: string, els: BcElements): void {
  // Reconnect SSE to the new workflow's event stream
  sse = openSSE(workflowId, els)

  // Tell the WS server to switch too
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'subscribe', workflowId }))
  }

  // Reset progress
  els.progressFill.style.width  = '0%'
  els.progressLabel.textContent = 'Loading…'
  els.progressStep.textContent  = ''
  clearHighlight()
}

// ─── Mount / unmount ──────────────────────────────────────────────────────────

type MountProps = {
  container?: HTMLElement
  mode?:      'card' | 'full'
}

async function mountApp(props: MountProps): Promise<void> {
  const container = props.container ?? document.getElementById('app')!
  if (!container) {
    console.error('[bpmn-canvas] no container element found')
    return
  }

  injectStyles()
  const els = buildDOM(container)

  // Populate workflow dropdown
  await populateSelect(els.selectEl)

  // Workflow switcher
  els.selectEl.addEventListener('change', () => {
    if (els.selectEl.value) switchWorkflow(els.selectEl.value, els)
  })

  // Open connections for the default workflow
  sse = openSSE(DEFAULT_WF_ID, els)
  ws  = openWS(els)
}

function unmountApp(): void {
  sse?.close()
  ws?.close()
  sse = ws = null

  viewer?.destroy()
  viewer = null
  activeElemId = null

  busUnsubs.splice(0).forEach((fn) => fn())
}

// ─── qiankun lifecycle exports ───────────────────────────────────────────────
// Named exports bootstrap/mount/unmount/update are required by qiankun.
// vite-plugin-qiankun useDevMode makes them discoverable at runtime.

export async function bootstrap(): Promise<void> {}

export async function mount(props: Record<string, unknown>): Promise<void> {
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  await mountApp(props as MountProps)
}

export async function unmount(_props: Record<string, unknown>): Promise<void> {
  unmountApp()
}

export async function update(_props: Record<string, unknown>): Promise<void> {}

// ─── Standalone mode ──────────────────────────────────────────────────────────

if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  const el = document.getElementById('app')
  if (el) {
    el.style.cssText = 'height:100vh;overflow:hidden;'
    mountApp({ mode: 'full' })
  }
}
