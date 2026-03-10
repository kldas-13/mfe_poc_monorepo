/**
 * bff.ts — Graph Canvas BFF
 * ═══════════════════════════════════════════════════════════════════════════
 * Owns the graph topology data for this canvas.
 * The MFE initialises a Graphology store from this BFF and keeps it live
 * via SSE and/or WebSocket pushes.
 *
 * ENDPOINTS
 * ─────────
 *   GET  /api/health             Liveness probe
 *   GET  /api/graph/topology     Full graph snapshot  { nodes[], edges[] }
 *   GET  /api/graph/events       SSE stream
 *   WS   /ws                     WebSocket (same events as SSE)
 *
 * SSE EVENTS  (event name → data shape)
 * ──────────────────────────────────────
 *   graph:init      { nodes: Node[], edges: Edge[] }   — sent immediately on connect
 *   graph:metrics   { metrics: Metric[] }              — sent every METRICS_MS
 *
 * WS MESSAGES  (server → client)
 * ────────────────────────────────
 *   { type: 'graph:init',    data: { nodes, edges },  ts }
 *   { type: 'graph:metrics', data: { metrics },       ts }
 *   { type: 'pong',          id: string,              ts }
 *
 * WS MESSAGES  (client → server)
 * ────────────────────────────────
 *   { type: 'ping', id: string }
 *
 * THE TOPOLOGY
 * ────────────
 * Describes the Unified Canvas platform itself — shell, BFFs, MFEs, and the
 * key libraries. This makes the graph visually meaningful and self-documenting
 * for anyone learning the architecture. In production, replace with data from
 * your service mesh, Consul catalog, or graph database.
 *
 * START
 * ─────
 *   npm install && npm run dev:bff
 *   Listens on http://localhost:3001
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Fastify from 'fastify'
import cors from '@fastify/cors'
import wsPlugin from '@fastify/websocket'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string
  label: string
  group: 'shell' | 'bff' | 'mfe' | 'lib' | 'infra'
  weight: number          // controls rendered node size
}

interface GraphEdge {
  id: string
  source: string
  target: string
  label: string
}

interface Topology {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface Metric {
  nodeId: string
  rps: number
  latencyMs: number
  errorRate: number       // 0.0 – 1.0
}

// ─── Static topology data ─────────────────────────────────────────────────────
// Describes the Unified Canvas architecture as a directed graph.
// Replace or extend this with real data from your service mesh.

const topology: Topology = {
  nodes: [
    { id: 'meta-shell', label: 'Meta Shell', group: 'shell', weight: 10 },
    { id: 'meta-bff', label: 'Meta BFF', group: 'bff', weight: 8 },
    { id: 'graph-bff', label: 'Graph BFF', group: 'bff', weight: 7 },
    { id: 'bpmn-bff', label: 'BPMN BFF', group: 'bff', weight: 7 },
    { id: 'graph-mfe', label: 'Graph MFE', group: 'mfe', weight: 6 },
    { id: 'bpmn-mfe', label: 'BPMN MFE', group: 'mfe', weight: 6 },
    { id: 'qiankun', label: 'qiankun', group: 'infra', weight: 9 },
    { id: 'eventbus', label: 'EventBus', group: 'infra', weight: 7 },
    { id: 'graphology', label: 'Graphology', group: 'lib', weight: 5 },
    { id: 'sigma', label: 'Sigma.js', group: 'lib', weight: 5 },
    { id: 'bpmn-js', label: 'bpmn-js', group: 'lib', weight: 5 },
    { id: 'fastify', label: 'Fastify', group: 'lib', weight: 4 },
  ],
  edges: [
    { id: 'e01', source: 'meta-shell', target: 'qiankun', label: 'orchestrates' },
    { id: 'e02', source: 'qiankun', target: 'graph-mfe', label: 'mounts' },
    { id: 'e03', source: 'qiankun', target: 'bpmn-mfe', label: 'mounts' },
    { id: 'e04', source: 'meta-shell', target: 'eventbus', label: 'creates' },
    { id: 'e05', source: 'eventbus', target: 'graph-mfe', label: 'injects into' },
    { id: 'e06', source: 'eventbus', target: 'bpmn-mfe', label: 'injects into' },
    { id: 'e07', source: 'meta-shell', target: 'meta-bff', label: 'SSE + WS' },
    { id: 'e08', source: 'graph-mfe', target: 'graph-bff', label: 'SSE + WS' },
    { id: 'e09', source: 'bpmn-mfe', target: 'bpmn-bff', label: 'SSE + WS' },
    { id: 'e10', source: 'graph-mfe', target: 'graphology', label: 'store' },
    { id: 'e11', source: 'graphology', target: 'sigma', label: 'data source' },
    { id: 'e12', source: 'bpmn-mfe', target: 'bpmn-js', label: 'renderer' },
    { id: 'e13', source: 'meta-bff', target: 'fastify', label: 'built on' },
    { id: 'e14', source: 'graph-bff', target: 'fastify', label: 'built on' },
    { id: 'e15', source: 'bpmn-bff', target: 'fastify', label: 'built on' },
  ],
}

// ─── Server ───────────────────────────────────────────────────────────────────

const PORT = Number(process.env['PORT'] ?? 3001)
const METRICS_MS = 5_000   // how often to push simulated metrics
const HEARTBEAT_MS = 20_000

const app = Fastify({ logger: { level: process.env['LOG_LEVEL'] ?? 'warn' } })
await app.register(cors, { origin: true })
await app.register(wsPlugin)

// ─── Client registries ────────────────────────────────────────────────────────

interface SseClient { id: string; write: (event: string, data: string) => void }
interface WsClient { id: string; socket: { send(d: string): void; readyState: number } }

const sseClients = new Map<string, SseClient>()
const wsClients = new Map<string, WsClient>()
const WS_OPEN = 1

function sseSend(c: SseClient, event: string, data: string) {
  try { c.write(event, data) }
  catch { sseClients.delete(c.id) }
}

function wsSend(c: WsClient, payload: string) {
  try { if (c.socket.readyState === WS_OPEN) c.socket.send(payload) }
  catch { wsClients.delete(c.id) }
}

// ─── Metrics generator ────────────────────────────────────────────────────────
// Produces random but plausible metrics for each node.
// Swap this for real Prometheus / service-mesh data in production.

function generateMetrics(): Metric[] {
  return topology.nodes.map((n) => ({
    nodeId: n.id,
    rps: Math.floor(Math.random() * 350),
    latencyMs: Math.floor(Math.random() * 90) + 4,
    errorRate: parseFloat((Math.random() * 0.04).toFixed(4)),
  }))
}

// ─── Metrics broadcaster ──────────────────────────────────────────────────────
// Runs every METRICS_MS and pushes to every connected client on both transports.

setInterval(() => {
  if (sseClients.size + wsClients.size === 0) return

  const metrics = generateMetrics()
  const sseData = JSON.stringify({ metrics })
  const wsData = JSON.stringify({ type: 'graph:metrics', data: { metrics }, ts: Date.now() })

  for (const c of sseClients.values()) sseSend(c, 'graph:metrics', sseData)
  for (const c of wsClients.values()) wsSend(c, wsData)
}, METRICS_MS)

// ─── REST ─────────────────────────────────────────────────────────────────────

app.get('/api/health', async () => ({
  status: 'ok', service: 'graph-canvas-bff', port: PORT, ts: Date.now(),
}))

// Full topology — used by the MFE on first load before SSE delivers graph:init
app.get('/api/graph/topology', async () => topology)

// ─── SSE: /api/graph/events ───────────────────────────────────────────────────
//
// MFE connects with:
//   const es = new EventSource('http://localhost:3001/api/graph/events')
//   es.addEventListener('graph:init',    e => JSON.parse(e.data))
//   es.addEventListener('graph:metrics', e => JSON.parse(e.data))

app.get('/api/graph/events', async (req, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream')
  reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
  reply.raw.setHeader('Connection', 'keep-alive')
  reply.raw.setHeader('X-Accel-Buffering', 'no')
  reply.raw.setHeader('Access-Control-Allow-Origin', '*')
  reply.raw.flushHeaders()

  const id = crypto.randomUUID()
  const write = (event: string, data: string) =>
    reply.raw.write(`event: ${event}\ndata: ${data}\n\n`)

  sseClients.set(id, { id, write })

  // 1. Send full topology immediately — the MFE can render right away
  write('graph:init', JSON.stringify(topology))

  // 2. Heartbeat to keep proxies alive
  const hb = setInterval(() => {
    try { reply.raw.write(': heartbeat\n\n') }
    catch { clearInterval(hb) }
  }, HEARTBEAT_MS)

  req.socket.on('close', () => {
    clearInterval(hb)
    sseClients.delete(id)
  })

  return new Promise<void>(() => { })  // keep handler alive
})

// ─── WebSocket: /ws ───────────────────────────────────────────────────────────
//
// MFE connects with:
//   const ws = new WebSocket('ws://localhost:3001/ws')

app.register(async (instance) => {
  instance.get('/ws', { websocket: true }, (socket, _req) => {
    const id = crypto.randomUUID()
    wsClients.set(id, { id, socket })

    // Send full topology immediately on connect
    socket.send(JSON.stringify({
      type: 'graph:init', data: topology, ts: Date.now(),
    }))

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; id?: string }
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', id: msg.id ?? null, ts: Date.now() }))
        }
      } catch { /* ignore malformed */ }
    })

    socket.on('close', () => wsClients.delete(id))
    socket.on('error', () => wsClients.delete(id))
  })
})

// ─── Start ────────────────────────────────────────────────────────────────────

await app.listen({ port: PORT, host: '0.0.0.0' })

console.log(`
╔═══════════════════════════════════════════════════╗
║         graph-canvas BFF  running on :${PORT}        ║
╠═══════════════════════════════════════════════════╣
║  REST  GET  http://localhost:${PORT}/api/health      ║
║  REST  GET  http://localhost:${PORT}/api/graph/topology ║
║  SSE   GET  http://localhost:${PORT}/api/graph/events   ║
║  WS         ws://localhost:${PORT}/ws                ║
╠═══════════════════════════════════════════════════╣
║  SSE events:  graph:init, graph:metrics           ║
║  WS  types:   graph:init, graph:metrics, pong     ║
╚═══════════════════════════════════════════════════╝
`)
