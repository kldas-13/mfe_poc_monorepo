/**
 * meta-bff / src/index.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * Aggregation BFF for the Unified Canvas Meta Shell.
 *
 * ENDPOINTS
 * ─────────
 *   GET  /api/health          Liveness probe  →  { status: 'ok' }
 *   GET  /api/snapshot        One-shot snapshot of all service health
 *   GET  /api/events          SSE stream  →  event: snapshot, data: JSON
 *   WS   /ws                  WebSocket   →  { type: 'snapshot', data: … }
 *
 * TRANSPORT DESIGN
 * ────────────────
 * Both SSE and WebSocket carry exactly the same DashboardSnapshot payload.
 * The shell opens both connections. SSE is the primary stream — it uses the
 * browser's built-in reconnect logic. WebSocket is the secondary stream — it
 * enables bidirectional messaging (ping/pong, future commands) and lets the
 * shell also demonstrate WS usage to peers reading the code.
 *
 * A single broadcaster function runs on an interval and pushes to ALL open
 * clients on BOTH transports simultaneously.
 *
 * SSE PROTOCOL
 * ────────────
 *   event: snapshot         Full DashboardSnapshot every INTERVAL_MS
 *   : heartbeat             Comment line every 20 s (keeps proxies alive)
 *
 * WebSocket PROTOCOL (server → client)
 * ─────────────────────────────────────
 *   { type: 'snapshot', data: DashboardSnapshot, ts: number }
 *   { type: 'pong',     id: string,              ts: number }
 *
 * WebSocket PROTOCOL (client → server)
 * ─────────────────────────────────────
 *   { type: 'ping', id: string }
 *
 * START
 * ─────
 *   npm install && npm run dev
 *   Server listens on http://localhost:3000
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Fastify      from 'fastify'
import cors         from '@fastify/cors'
import wsPlugin     from '@fastify/websocket'
import { buildSnapshot } from './services.js'

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT         = Number(process.env['PORT'] ?? 3000)
const INTERVAL_MS  = 5_000   // how often to push a new snapshot to all clients
const HEARTBEAT_MS = 20_000  // SSE comment to keep proxies from timing out the connection

// ─── Server ───────────────────────────────────────────────────────────────────

const app = Fastify({
  logger: {
    level: process.env['LOG_LEVEL'] ?? 'warn',
    transport: { target: 'pino-pretty' },
  },
})

// CORS — open to all origins in dev so the shell on :5173 can reach us
await app.register(cors, {
  origin: [
    'http://localhost:5173',  // meta-shell
    'http://localhost:5174',  // graph-canvas MFE (in overview mode, both are on screen)
    'http://localhost:5175',  // bpmn-canvas MFE
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Cache-Control'],
  exposedHeaders: ['Content-Type'],
  credentials: false,
})

app.addHook('onRequest', (_req, reply, done) => {
  reply.header('Access-Control-Allow-Origin',  '*')
  reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Cache-Control')
  done()
})

await app.register(wsPlugin)

// ─── SSE client registry ──────────────────────────────────────────────────────
//
// Each connected SSE client gets a unique ID.
// We store a thin write() wrapper so the broadcaster doesn't need to
// know about the underlying Node.js response stream.

interface SseClient {
  id:    string
  write: (event: string, data: string) => void
}

const sseClients = new Map<string, SseClient>()

function sseSend(client: SseClient, event: string, data: string): void {
  try {
    client.write(event, data)
  } catch {
    // Write to a closed stream — remove the client
    sseClients.delete(client.id)
  }
}

// ─── WebSocket client registry ────────────────────────────────────────────────

interface WsClient {
  id:     string
  socket: { send: (data: string) => void; readyState: number }
}

const WS_OPEN = 1  // WebSocket.OPEN — not available in Node without the ws types
const wsClients = new Map<string, WsClient>()

function wsSend(client: WsClient, payload: string): void {
  try {
    if (client.socket.readyState === WS_OPEN) client.socket.send(payload)
  } catch {
    wsClients.delete(client.id)
  }
}

// ─── Broadcaster ─────────────────────────────────────────────────────────────
//
// This is the single source of truth for pushed data.
// Called by the interval below — pushes the same snapshot to every
// connected SSE client and every connected WebSocket client.

async function broadcast(): Promise<void> {
  // Skip the probe round-trip if nobody is listening
  if (sseClients.size + wsClients.size === 0) return

  let snap: Awaited<ReturnType<typeof buildSnapshot>>
  try {
    snap = await buildSnapshot()
  } catch (err) {
    console.error('[meta-bff] buildSnapshot failed:', err)
    return
  }

  const json = JSON.stringify(snap)

  // Push to all SSE clients
  for (const client of sseClients.values()) {
    sseSend(client, 'snapshot', json)
  }

  // Push to all WebSocket clients
  const wsPayload = JSON.stringify({ type: 'snapshot', data: snap, ts: Date.now() })
  for (const client of wsClients.values()) {
    wsSend(client, wsPayload)
  }
}

// Start the broadcast loop as soon as the server is up
setInterval(broadcast, INTERVAL_MS)

// ─── REST: liveness probe ─────────────────────────────────────────────────────

app.get('/api/health', async () => ({
  status:  'ok',
  service: 'meta-bff',
  port:    PORT,
  ts:      Date.now(),
}))

// ─── REST: one-shot snapshot ──────────────────────────────────────────────────
//
// Useful for:
//   • Initial page load before the SSE stream has delivered a message
//   • Curl / Postman testing
//   • Other BFFs that want to query this one

app.get('/api/snapshot', async (_req, reply) => {
  const snap = await buildSnapshot()
  reply.send(snap)
})

// ─── SSE: /api/events ────────────────────────────────────────────────────────
//
// Shell connects with:
//   const es = new EventSource('http://localhost:3000/api/events')
//   es.addEventListener('snapshot', e => JSON.parse(e.data))
//
// The browser auto-reconnects if the connection drops.
// We also send an SSE heartbeat comment every HEARTBEAT_MS to keep
// load-balancers and Nginx from closing idle connections.

app.get('/api/events', async (req, reply) => {
  // Required headers for a valid SSE stream
  reply.raw.setHeader('Content-Type',      'text/event-stream')
  reply.raw.setHeader('Cache-Control',     'no-cache, no-transform')
  reply.raw.setHeader('Connection',        'keep-alive')
  reply.raw.setHeader('X-Accel-Buffering', 'no')  // disable Nginx buffering
  reply.raw.flushHeaders()

  const clientId = crypto.randomUUID()

  const write = (event: string, data: string): void => {
    reply.raw.write(`event: ${event}\ndata: ${data}\n\n`)
  }

  sseClients.set(clientId, { id: clientId, write })
  app.log.info({ clientId, total: sseClients.size }, 'SSE client connected')

  // Send the first snapshot immediately so the shell has data before
  // the interval fires
  try {
    const snap = await buildSnapshot()
    write('snapshot', JSON.stringify(snap))
  } catch (err) {
    app.log.error(err, 'Failed to send initial SSE snapshot')
  }

  // Heartbeat — a bare SSE comment (lines starting with ':')
  const heartbeat = setInterval(() => {
    try {
      reply.raw.write(': heartbeat\n\n')
    } catch {
      clearInterval(heartbeat)
    }
  }, HEARTBEAT_MS)

  // Clean up when the client disconnects
  req.socket.on('close', () => {
    clearInterval(heartbeat)
    sseClients.delete(clientId)
    app.log.info({ clientId, total: sseClients.size }, 'SSE client disconnected')
  })

  // Return a never-resolving promise to keep the Fastify handler alive.
  // Fastify would otherwise close the response after the handler returns.
  return new Promise<void>(() => {})
})

// ─── WebSocket: /ws ───────────────────────────────────────────────────────────
//
// Shell connects with:
//   const ws = new WebSocket('ws://localhost:3000/ws')
//
// All WebSocket routes must be registered inside a plugin that has
// the @fastify/websocket decorator applied.

app.register(async (instance) => {
  instance.get(
    '/ws',
    { websocket: true },
    (socket, req) => {
      const clientId = crypto.randomUUID()
      wsClients.set(clientId, { id: clientId, socket })
      app.log.info({ clientId, total: wsClients.size }, 'WS client connected')

      // Send initial snapshot immediately on connect
      buildSnapshot()
        .then((snap) => {
          wsSend(
            { id: clientId, socket },
            JSON.stringify({ type: 'snapshot', data: snap, ts: Date.now() })
          )
        })
        .catch((err) => app.log.error(err, 'Failed to send initial WS snapshot'))

      // Handle messages from the client
      socket.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type: string; id?: string }

          if (msg.type === 'ping') {
            // Respond with a pong — the shell uses this for latency checks
            socket.send(JSON.stringify({
              type: 'pong',
              id:   msg.id ?? null,
              ts:   Date.now(),
            }))
          }
          // Future: handle 'subscribe', 'unsubscribe', 'command' messages here
        } catch {
          // Ignore malformed messages
        }
      })

      socket.on('close', () => {
        wsClients.delete(clientId)
        app.log.info({ clientId, total: wsClients.size }, 'WS client disconnected')
      })

      socket.on('error', (err: Error) => {
        app.log.warn({ clientId, err: err.message }, 'WS socket error')
        wsClients.delete(clientId)
      })
    }
  )
})

// ─── Start ────────────────────────────────────────────────────────────────────

await app.listen({ port: PORT, host: '0.0.0.0' })

// Print a clear startup banner so anyone running this knows what's available
console.log(`
╔══════════════════════════════════════════════════════╗
║               meta-bff  running on :${PORT}              ║
╠══════════════════════════════════════════════════════╣
║  REST  GET  http://localhost:${PORT}/api/health         ║
║  REST  GET  http://localhost:${PORT}/api/snapshot       ║
║  SSE   GET  http://localhost:${PORT}/api/events         ║
║  WS         ws://localhost:${PORT}/ws                   ║
╠══════════════════════════════════════════════════════╣
║  Broadcasts every ${String(INTERVAL_MS / 1000).padEnd(2)}s to all connected clients     ║
║  SSE heartbeat every ${String(HEARTBEAT_MS / 1000).padEnd(2)}s                       ║
╠══════════════════════════════════════════════════════╣
║  Expected downstream services                        ║
║    graph-canvas-bff  :3001                           ║
║    bpmn-canvas-bff   :3002                           ║
║    meta-shell        :5173                           ║
║    graph-canvas-mfe  :5174                           ║
║    bpmn-canvas-mfe   :5175                           ║
╚══════════════════════════════════════════════════════╝
`)
