/**
 * bff.ts — BPMN Canvas BFF
 * ═══════════════════════════════════════════════════════════════════════════
 * Owns BPMN workflow data and simulates live execution.
 *
 * ENDPOINTS
 * ─────────
 *   GET  /api/health                  Liveness probe
 *   GET  /api/workflows               List all available workflows
 *   GET  /api/workflows/:id           Full workflow  { id, name, xml }
 *   GET  /api/workflows/:id/events    SSE stream for that workflow's execution
 *   WS   /ws                          WebSocket — same execution events
 *
 * SSE EVENTS  (on /api/workflows/:id/events)
 * ──────────────────────────────────────────
 *   workflow:init       { workflow }           — sent immediately on connect
 *   workflow:step       { step: StepEvent }    — one per execution step
 *   workflow:complete   { workflowId, ts }     — when the run finishes
 *   workflow:reset      { workflowId, ts }     — loop restarted
 *
 * WS MESSAGES  (server → client)
 * ────────────────────────────────
 *   { type: 'workflow:init',     data: { workflow },      ts }
 *   { type: 'workflow:step',     data: { step },          ts }
 *   { type: 'workflow:complete', data: { workflowId },    ts }
 *   { type: 'workflow:reset',    data: { workflowId },    ts }
 *   { type: 'pong',              id: string,              ts }
 *
 * WS MESSAGES  (client → server)
 * ────────────────────────────────
 *   { type: 'ping',      id: string }
 *   { type: 'subscribe', workflowId: string }   — switch active workflow
 *
 * EXECUTION SIMULATION
 * ────────────────────
 * The BFF walks through each workflow's steps array one step at a time,
 * broadcasting the active element ID. The MFE uses that ID to highlight
 * the corresponding shape in the bpmn-js canvas.
 * Steps loop: complete → 2 s pause → reset → walk again.
 *
 * START
 * ─────
 *   npm install && npm run dev:bff
 *   Listens on http://localhost:3002
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Fastify from 'fastify'
import cors from '@fastify/cors'
import wsPlugin from '@fastify/websocket'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Workflow {
  id: string
  name: string
  description: string
  steps: string[]   // BPMN element IDs in execution order
  xml: string
}

interface StepEvent {
  workflowId: string
  elementId: string    // the currently active BPMN element
  stepIndex: number
  totalSteps: number
  label: string
  ts: number
}

// ─── BPMN XML ─────────────────────────────────────────────────────────────────
// Unified Canvas ML Pipeline.
// Element IDs here MUST match the ids used in the XML so the MFE can
// call bpmnJS.get('canvas').addMarker(elementId, 'active-step').

const PIPELINE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_1"
  targetNamespace="http://bpmn.io/schema/bpmn">

  <bpmn:process id="ml-pipeline" name="Unified Canvas ML Pipeline" isExecutable="true">

    <bpmn:startEvent id="start" name="Pipeline Triggered">
      <bpmn:outgoing>f01</bpmn:outgoing>
    </bpmn:startEvent>

    <bpmn:task id="validate" name="Validate Input">
      <bpmn:incoming>f01</bpmn:incoming>
      <bpmn:outgoing>f02</bpmn:outgoing>
    </bpmn:task>

    <bpmn:serviceTask id="iam-check" name="IAM Auth Check">
      <bpmn:incoming>f02</bpmn:incoming>
      <bpmn:outgoing>f03</bpmn:outgoing>
    </bpmn:serviceTask>

    <bpmn:exclusiveGateway id="auth-gw" name="Auth OK?">
      <bpmn:incoming>f03</bpmn:incoming>
      <bpmn:outgoing>f04-ok</bpmn:outgoing>
      <bpmn:outgoing>f04-fail</bpmn:outgoing>
    </bpmn:exclusiveGateway>

    <bpmn:endEvent id="end-unauth" name="Unauthorised">
      <bpmn:incoming>f04-fail</bpmn:incoming>
    </bpmn:endEvent>

    <bpmn:parallelGateway id="fan-out" name="Fan Out">
      <bpmn:incoming>f04-ok</bpmn:incoming>
      <bpmn:outgoing>f05-aof</bpmn:outgoing>
      <bpmn:outgoing>f05-etl</bpmn:outgoing>
      <bpmn:outgoing>f05-ml</bpmn:outgoing>
    </bpmn:parallelGateway>

    <bpmn:serviceTask id="aof" name="AOF Engine">
      <bpmn:incoming>f05-aof</bpmn:incoming>
      <bpmn:outgoing>f06-aof</bpmn:outgoing>
    </bpmn:serviceTask>

    <bpmn:serviceTask id="etl" name="SeaTunnel ETL">
      <bpmn:incoming>f05-etl</bpmn:incoming>
      <bpmn:outgoing>f06-etl</bpmn:outgoing>
    </bpmn:serviceTask>

    <bpmn:serviceTask id="ml-train" name="Kubeflow Training">
      <bpmn:incoming>f05-ml</bpmn:incoming>
      <bpmn:outgoing>f06-ml</bpmn:outgoing>
    </bpmn:serviceTask>

    <bpmn:parallelGateway id="fan-in" name="Fan In">
      <bpmn:incoming>f06-aof</bpmn:incoming>
      <bpmn:incoming>f06-etl</bpmn:incoming>
      <bpmn:incoming>f06-ml</bpmn:incoming>
      <bpmn:outgoing>f07</bpmn:outgoing>
    </bpmn:parallelGateway>

    <bpmn:task id="aggregate" name="BFF Aggregate Results">
      <bpmn:incoming>f07</bpmn:incoming>
      <bpmn:outgoing>f08</bpmn:outgoing>
    </bpmn:task>

    <bpmn:serviceTask id="notify" name="Push via WebSocket">
      <bpmn:incoming>f08</bpmn:incoming>
      <bpmn:outgoing>f09</bpmn:outgoing>
    </bpmn:serviceTask>

    <bpmn:endEvent id="end-ok" name="Pipeline Complete">
      <bpmn:incoming>f09</bpmn:incoming>
    </bpmn:endEvent>

    <bpmn:sequenceFlow id="f01"      sourceRef="start"     targetRef="validate"  />
    <bpmn:sequenceFlow id="f02"      sourceRef="validate"  targetRef="iam-check" />
    <bpmn:sequenceFlow id="f03"      sourceRef="iam-check" targetRef="auth-gw"   />
    <bpmn:sequenceFlow id="f04-ok"   sourceRef="auth-gw"   targetRef="fan-out"   name="Yes"/>
    <bpmn:sequenceFlow id="f04-fail" sourceRef="auth-gw"   targetRef="end-unauth" name="No"/>
    <bpmn:sequenceFlow id="f05-aof"  sourceRef="fan-out"   targetRef="aof"       />
    <bpmn:sequenceFlow id="f05-etl"  sourceRef="fan-out"   targetRef="etl"       />
    <bpmn:sequenceFlow id="f05-ml"   sourceRef="fan-out"   targetRef="ml-train"  />
    <bpmn:sequenceFlow id="f06-aof"  sourceRef="aof"       targetRef="fan-in"    />
    <bpmn:sequenceFlow id="f06-etl"  sourceRef="etl"       targetRef="fan-in"    />
    <bpmn:sequenceFlow id="f06-ml"   sourceRef="ml-train"  targetRef="fan-in"    />
    <bpmn:sequenceFlow id="f07"      sourceRef="fan-in"    targetRef="aggregate" />
    <bpmn:sequenceFlow id="f08"      sourceRef="aggregate" targetRef="notify"    />
    <bpmn:sequenceFlow id="f09"      sourceRef="notify"    targetRef="end-ok"    />
  </bpmn:process>

  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="ml-pipeline">
      <bpmndi:BPMNShape id="s-start"      bpmnElement="start"    ><dc:Bounds x="152" y="252" width="36"  height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s-validate"   bpmnElement="validate" ><dc:Bounds x="240" y="230" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s-iam"        bpmnElement="iam-check" isMarkerVisible="true"><dc:Bounds x="392" y="230" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s-authgw"     bpmnElement="auth-gw"   isMarkerVisible="true"><dc:Bounds x="547" y="245" width="50"  height="50" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s-end-unauth" bpmnElement="end-unauth"><dc:Bounds x="554" y="132" width="36"  height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s-fanout"     bpmnElement="fan-out"  ><dc:Bounds x="657" y="245" width="50"  height="50" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s-aof"        bpmnElement="aof"       isMarkerVisible="true"><dc:Bounds x="762" y="150" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s-etl"        bpmnElement="etl"       isMarkerVisible="true"><dc:Bounds x="762" y="230" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s-ml"         bpmnElement="ml-train"  isMarkerVisible="true"><dc:Bounds x="762" y="310" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s-fanin"      bpmnElement="fan-in"   ><dc:Bounds x="917" y="245" width="50"  height="50" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s-aggregate"  bpmnElement="aggregate"><dc:Bounds x="1022" y="230" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s-notify"     bpmnElement="notify"    isMarkerVisible="true"><dc:Bounds x="1174" y="230" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s-end-ok"     bpmnElement="end-ok"   ><dc:Bounds x="1326" y="252" width="36"  height="36" /></bpmndi:BPMNShape>

      <bpmndi:BPMNEdge id="e-f01"      bpmnElement="f01"     ><di:waypoint x="188" y="270"/><di:waypoint x="240" y="270"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e-f02"      bpmnElement="f02"     ><di:waypoint x="340" y="270"/><di:waypoint x="392" y="270"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e-f03"      bpmnElement="f03"     ><di:waypoint x="492" y="270"/><di:waypoint x="547" y="270"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e-f04ok"    bpmnElement="f04-ok"  ><di:waypoint x="597" y="270"/><di:waypoint x="657" y="270"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e-f04fail"  bpmnElement="f04-fail"><di:waypoint x="572" y="245"/><di:waypoint x="572" y="168"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e-f05aof"   bpmnElement="f05-aof" ><di:waypoint x="682" y="245"/><di:waypoint x="762" y="190"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e-f05etl"   bpmnElement="f05-etl" ><di:waypoint x="707" y="270"/><di:waypoint x="762" y="270"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e-f05ml"    bpmnElement="f05-ml"  ><di:waypoint x="682" y="295"/><di:waypoint x="762" y="350"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e-f06aof"   bpmnElement="f06-aof" ><di:waypoint x="862" y="190"/><di:waypoint x="942" y="245"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e-f06etl"   bpmnElement="f06-etl" ><di:waypoint x="862" y="270"/><di:waypoint x="917" y="270"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e-f06ml"    bpmnElement="f06-ml"  ><di:waypoint x="862" y="350"/><di:waypoint x="942" y="295"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e-f07"      bpmnElement="f07"     ><di:waypoint x="967" y="270"/><di:waypoint x="1022" y="270"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e-f08"      bpmnElement="f08"     ><di:waypoint x="1122" y="270"/><di:waypoint x="1174" y="270"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="e-f09"      bpmnElement="f09"     ><di:waypoint x="1274" y="270"/><di:waypoint x="1326" y="270"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

// ─── Workflow registry ────────────────────────────────────────────────────────
// steps[] are the BPMN element IDs in execution order.
// The simulator advances through this array and broadcasts each active ID.

const WORKFLOWS: Workflow[] = [
  {
    id: 'ml-pipeline',
    name: 'Unified Canvas ML Pipeline',
    description: 'Validates input → IAM check → parallel AOF/ETL/ML → aggregate → notify',
    steps: [
      'start', 'validate', 'iam-check', 'auth-gw',
      'fan-out', 'aof', 'etl', 'ml-train',
      'fan-in', 'aggregate', 'notify', 'end-ok',
    ],
    xml: PIPELINE_XML,
  },
]

const workflowMap = new Map(WORKFLOWS.map((w) => [w.id, w]))

// ─── Execution simulator ──────────────────────────────────────────────────────
// Maintains an independent cursor for each workflow that is currently being
// watched by at least one client. Advances every STEP_MS milliseconds.

const STEP_MS = 2_200   // time between step transitions
const PAUSE_MS = 2_000   // pause after complete before looping

// Map from workflowId → current step index
const cursors = new Map<string, number>()

function nextStep(workflowId: string, workflow: Workflow): StepEvent {
  const idx = (cursors.get(workflowId) ?? 0)
  const elemId = workflow.steps[idx]!
  cursors.set(workflowId, idx + 1)
  return {
    workflowId,
    elementId: elemId,
    stepIndex: idx,
    totalSteps: workflow.steps.length,
    label: elemId.replace(/-/g, ' '),
    ts: Date.now(),
  }
}

// ─── Server ───────────────────────────────────────────────────────────────────

const PORT = Number(process.env['PORT'] ?? 3002)
const HEARTBEAT_MS = 20_000

const app = Fastify({ logger: { level: process.env['LOG_LEVEL'] ?? 'warn' } })
await app.register(cors, { origin: true })
await app.register(wsPlugin)

// ─── Client registries ────────────────────────────────────────────────────────

interface SseClient {
  id: string
  workflowId: string
  write: (event: string, data: string) => void
}

interface WsClient {
  id: string
  workflowId: string
  socket: { send(d: string): void; readyState: number }
}

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

// ─── Step broadcaster ─────────────────────────────────────────────────────────
// For each workflow that has active clients, advance one step and push to all
// clients watching that workflow.

setInterval(() => {
  // Collect unique workflow IDs currently being watched
  const activeWorkflowIds = new Set<string>()
  for (const c of sseClients.values()) activeWorkflowIds.add(c.workflowId)
  for (const c of wsClients.values()) activeWorkflowIds.add(c.workflowId)

  for (const wfId of activeWorkflowIds) {
    const workflow = workflowMap.get(wfId)
    if (!workflow) continue

    const currentIdx = cursors.get(wfId) ?? 0

    if (currentIdx >= workflow.steps.length) {
      // Workflow complete — broadcast complete, then schedule reset
      const completePayload = JSON.stringify({ workflowId: wfId, ts: Date.now() })
      const wsComplete = JSON.stringify({ type: 'workflow:complete', data: { workflowId: wfId }, ts: Date.now() })

      for (const c of sseClients.values()) {
        if (c.workflowId === wfId) sseSend(c, 'workflow:complete', completePayload)
      }
      for (const c of wsClients.values()) {
        if (c.workflowId === wfId) wsSend(c, wsComplete)
      }

      // Reset after pause
      setTimeout(() => {
        cursors.set(wfId, 0)
        const resetPayload = JSON.stringify({ workflowId: wfId, ts: Date.now() })
        const wsReset = JSON.stringify({ type: 'workflow:reset', data: { workflowId: wfId }, ts: Date.now() })
        for (const c of sseClients.values()) {
          if (c.workflowId === wfId) sseSend(c, 'workflow:reset', resetPayload)
        }
        for (const c of wsClients.values()) {
          if (c.workflowId === wfId) wsSend(c, wsReset)
        }
      }, PAUSE_MS)

      continue
    }

    const step = nextStep(wfId, workflow)
    const sseData = JSON.stringify({ step })
    const wsPayload = JSON.stringify({ type: 'workflow:step', data: { step }, ts: Date.now() })

    for (const c of sseClients.values()) {
      if (c.workflowId === wfId) sseSend(c, 'workflow:step', sseData)
    }
    for (const c of wsClients.values()) {
      if (c.workflowId === wfId) wsSend(c, wsPayload)
    }
  }
}, STEP_MS)

// ─── REST ─────────────────────────────────────────────────────────────────────

app.get('/api/health', async () => ({
  status: 'ok', service: 'bpmn-canvas-bff', port: PORT, ts: Date.now(),
}))

app.get('/api/workflows', async () =>
  WORKFLOWS.map(({ id, name, description }) => ({ id, name, description }))
)

app.get<{ Params: { id: string } }>('/api/workflows/:id', async (req, reply) => {
  const w = workflowMap.get(req.params.id)
  if (!w) return reply.status(404).send({ error: 'workflow not found' })
  return w
})

// ─── SSE: /api/workflows/:id/events ──────────────────────────────────────────
//
// MFE connects with:
//   const es = new EventSource('http://localhost:3002/api/workflows/ml-pipeline/events')
//   es.addEventListener('workflow:init',     e => ...)
//   es.addEventListener('workflow:step',     e => ...)
//   es.addEventListener('workflow:complete', e => ...)
//   es.addEventListener('workflow:reset',    e => ...)

app.get<{ Params: { id: string } }>('/api/workflows/:id/events', async (req, reply) => {
  const workflow = workflowMap.get(req.params.id)
  if (!workflow) {
    reply.status(404).send({ error: 'workflow not found' })
    return
  }

  reply.raw.setHeader('Content-Type', 'text/event-stream')
  reply.raw.setHeader('Cache-Control', 'no-cache, no-transform')
  reply.raw.setHeader('Connection', 'keep-alive')
  reply.raw.setHeader('X-Accel-Buffering', 'no')
  reply.raw.setHeader('Access-Control-Allow-Origin', '*')
  reply.raw.flushHeaders()

  const id = crypto.randomUUID()
  const write = (event: string, data: string) =>
    reply.raw.write(`event: ${event}\ndata: ${data}\n\n`)

  sseClients.set(id, { id, workflowId: workflow.id, write })

  // Send the full workflow (including XML) immediately so the MFE can render
  // the diagram before the first step event arrives
  write('workflow:init', JSON.stringify({ workflow }))

  // Heartbeat
  const hb = setInterval(() => {
    try { reply.raw.write(': heartbeat\n\n') }
    catch { clearInterval(hb) }
  }, HEARTBEAT_MS)

  req.socket.on('close', () => {
    clearInterval(hb)
    sseClients.delete(id)
  })

  return new Promise<void>(() => { })
})

// ─── WebSocket: /ws ───────────────────────────────────────────────────────────
//
// MFE connects with:
//   const ws = new WebSocket('ws://localhost:3002/ws')
//
// After connecting, client sends:
//   { type: 'subscribe', workflowId: 'ml-pipeline' }
//
// Until subscribe is received, client is subscribed to the first workflow.

app.register(async (instance) => {
  instance.get('/ws', { websocket: true }, (socket, _req) => {
    const id = crypto.randomUUID()
    const defaultWfId = WORKFLOWS[0]!.id
    wsClients.set(id, { id, workflowId: defaultWfId, socket })

    // Send initial workflow data
    const defaultWf = workflowMap.get(defaultWfId)!
    socket.send(JSON.stringify({
      type: 'workflow:init',
      data: { workflow: defaultWf },
      ts: Date.now(),
    }))

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; id?: string; workflowId?: string }

        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', id: msg.id ?? null, ts: Date.now() }))
        }

        if (msg.type === 'subscribe' && msg.workflowId) {
          const wf = workflowMap.get(msg.workflowId)
          if (wf) {
            // Switch this client to the requested workflow
            wsClients.set(id, { id, workflowId: msg.workflowId, socket })
            cursors.set(msg.workflowId, 0)
            socket.send(JSON.stringify({
              type: 'workflow:init',
              data: { workflow: wf },
              ts: Date.now(),
            }))
          }
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
╔═══════════════════════════════════════════════════════════╗
║           bpmn-canvas BFF  running on :${PORT}               ║
╠═══════════════════════════════════════════════════════════╣
║  REST  GET  http://localhost:${PORT}/api/health              ║
║  REST  GET  http://localhost:${PORT}/api/workflows           ║
║  REST  GET  http://localhost:${PORT}/api/workflows/:id       ║
║  SSE   GET  http://localhost:${PORT}/api/workflows/:id/events║
║  WS         ws://localhost:${PORT}/ws                        ║
╠═══════════════════════════════════════════════════════════╣
║  SSE events:  workflow:init, workflow:step,               ║
║               workflow:complete, workflow:reset           ║
╚═══════════════════════════════════════════════════════════╝
`)
