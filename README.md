# Unified Canvas — System README

A micro-frontend platform built with **qiankun**, **Fastify**, **Graphology + Sigma.js**, and **bpmn-js**. Four independent repositories that run together as one system.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  meta-shell  :5173                                  │
│  qiankun host — Dashboard, Overview, full-screen    │
│  Connects to meta-bff for live service health       │
└────────────┬──────────────────┬─────────────────────┘
             │ SSE + WS         │ loadMicroApp()
             ▼                  ▼
┌────────────────────┐  ┌──────────────┐  ┌───────────────┐
│  meta-bff  :3000   │  │ graph-canvas │  │  bpmn-canvas  │
│  Aggregation BFF   │  │ BFF  :3001   │  │  BFF  :3002   │
│  Probes all        │  │ MFE  :5174   │  │  MFE  :5175   │
│  services          │  │              │  │               │
└────────────────────┘  └──────────────┘  └───────────────┘
```

### Port Map

| Repo | Process | Port |
|---|---|---|
| `meta-bff` | Fastify REST + SSE + WS | 3000 |
| `graph-canvas` | Fastify BFF | 3001 |
| `graph-canvas` | Vite MFE (UMD preview) | 5174 |
| `bpmn-canvas` | Fastify BFF | 3002 |
| `bpmn-canvas` | Vite MFE (UMD preview) | 5175 |
| `meta-shell` | Vite shell | 5173 |

---

## Prerequisites

- **Node.js** 18 or higher (`node --version`)
- **npm** 9 or higher (`npm --version`)
- Four terminal windows (or a terminal multiplexer like tmux)

---

## First-time Setup

Run this once in each repo after cloning. Order does not matter for installation.

```bash
cd meta-bff     && npm install
cd graph-canvas && npm install
cd bpmn-canvas  && npm install
cd meta-shell   && npm install
```

---

## Starting the System

Start the repos in this order. Each command must be run in a separate terminal.

### Terminal 1 — meta-bff
```bash
cd meta-bff
npm run dev
```
Wait until you see:
```
meta-bff  running on :3000
```

### Terminal 2 — graph-canvas
```bash
cd graph-canvas
npm run dev
```
This starts two processes concurrently:
- The BFF (Fastify on `:3001`) starts immediately
- The MFE builds first, then serves the bundle on `:5174`

Wait until you see both:
```
[BFF] graph-canvas BFF running on :3001
[MFE] Local: http://localhost:5174/
```

### Terminal 3 — bpmn-canvas
```bash
cd bpmn-canvas
npm run dev
```
Same pattern as graph-canvas. Wait for both:
```
[BFF] bpmn-canvas BFF running on :3002
[MFE] Local: http://localhost:5175/
```

### Terminal 4 — meta-shell
```bash
cd meta-shell
npm run dev
```
Wait until you see:
```
Local: http://localhost:5173/
```

### Open the app
```
http://localhost:5173
```

---

## What You Should See

| Page | How to reach it | What it shows |
|---|---|---|
| Dashboard | Default on load | Live health cards for all 6 services, SSE + WS indicators, event log |
| Overview | Click ⧉ Overview | Both MFEs mounted simultaneously as large cards |
| Service Graph | Click ⬡ Service Graph | Interactive Graphology + Sigma.js graph, full screen |
| BPMN Canvas | Click ◈ BPMN Canvas | bpmn-js diagram with live step execution, full screen |

---

## Individual Repo Development

Each repo is fully independent. You can run and develop them without the shell.

### Develop graph-canvas in isolation
```bash
# Terminal 1
cd graph-canvas
npm run dev:bff        # BFF only on :3001

# Terminal 2
cd graph-canvas
npm run build:mfe      # build the MFE bundle
npx vite preview --port 5174  # serve it
```
Open `http://localhost:5174` — the graph canvas renders standalone.

### Develop bpmn-canvas in isolation
```bash
# Terminal 1
cd bpmn-canvas
npm run dev:bff        # BFF only on :3002

# Terminal 2
cd bpmn-canvas
npm run build:mfe
npx vite preview --port 5175
```
Open `http://localhost:5175` — the BPMN canvas renders standalone.

### After editing MFE source files
The MFEs are served as pre-built UMD bundles. If you change `src/app.ts` in either canvas repo, rebuild:
```bash
cd graph-canvas && npm run build:mfe
# then refresh the browser
```

---

## Repo Structure

```
meta-bff/
├── src/
│   ├── index.ts       Fastify server — REST, SSE, WebSocket
│   └── services.ts    Service registry + health probe logic
├── package.json
└── tsconfig.json

meta-shell/
├── src/
│   ├── main.ts        Shell layout, navigation, qiankun mounting
│   └── eventbus.ts    Typed cross-MFE event bus (window.__UC_BUS)
├── index.html
└── package.json

graph-canvas/
├── src/
│   └── app.ts         Graphology store + Sigma.js renderer + qiankun lifecycle
├── bff.ts             Graph BFF — topology data, SSE, WebSocket
├── index.html
├── vite.config.ts
└── package.json

bpmn-canvas/
├── src/
│   └── app.ts         bpmn-js viewer + step highlighting + qiankun lifecycle
├── bff.ts             BPMN BFF — workflow XML, execution simulation, SSE, WebSocket
├── index.html
├── vite.config.ts
└── package.json
```

---

## Cross-MFE Communication (EventBus)

The shell creates one `EventBus` instance and exposes it on `window.__UC_BUS` before any MFE mounts. MFEs read it from `window` — no shared package needed.

### Using the bus in any MFE

```ts
// Subscribe — always save the unsubscribe fn and call it in unmount()
const off = window.__UC_BUS?.on('graph:node-clicked', (data) => {
  console.log('node clicked:', data)
})

// Publish
window.__UC_BUS?.emit('bpmn:step-changed', {
  from: 'validate', to: 'iam-check', ts: Date.now()
})

// In your unmount() — prevents memory leaks
off?.()
```

### Canonical event names

| Event | Payload | Emitted by |
|---|---|---|
| `mfe:ready` | `{ name }` | shell, after each MFE mounts |
| `graph:topology-loaded` | `{ nodeCount, edgeCount }` | graph-canvas |
| `graph:node-clicked` | `{ nodeId, label, group }` | graph-canvas |
| `graph:metrics-updated` | `{ metrics[] }` | graph-canvas |
| `bpmn:workflow-loaded` | `{ workflowId, name }` | bpmn-canvas |
| `bpmn:step-changed` | `{ from, to, ts }` | bpmn-canvas |

All bus events appear in the Dashboard event log so you can verify cross-MFE communication is working.

---

## BFF Transport Design

Every BFF exposes both SSE and WebSocket carrying identical payloads. Both transports are shown for learning purposes — in production pick one.

| Transport | Endpoint | Use case |
|---|---|---|
| SSE | `GET /api/events` or `/api/*/events` | Server → client stream, browser auto-reconnects |
| WebSocket | `ws://localhost:PORT/ws` | Bidirectional, ping/pong keepalive |
| REST | `GET /api/health`, `/api/*` | One-shot fetch, initial data load |

---

## Adding a New Canvas

1. Create a new repo following `graph-canvas` as a template, using ports `:3003` (BFF) and `:5176` (MFE)
2. In `meta-shell/src/main.ts`:
   - Add a constant: `const MYAPP_URL = 'http://localhost:5176/'`
   - Add a nav button with `data-page="myapp"` in `buildLayout()`
   - Add a page div with `id="page-myapp"` in `buildLayout()`
   - Add a case in `navigate()`:
     ```ts
     case 'myapp':
       mountMfe('myapp', MYAPP_URL, '#mount-myapp-full', { mode: 'full' })
       break
     ```
3. For the Overview page, add a third `.canvas-card` and update the grid:
   ```css
   grid-template-columns: repeat(3, 1fr)
   ```

No changes needed in any other repo.

---

## Troubleshooting

**Dashboard shows "Waiting for meta-bff" / transport indicators are offline**
→ meta-bff is not running. Start Terminal 1 first.

**Clicking Overview or Service Graph shows a spinner that never resolves**
→ The MFE bundle has not been built yet. In the canvas repo run `npm run build:mfe`, then refresh.

**`Cannot use import statement outside a module` in console**
→ The MFE is being served as raw TypeScript instead of a UMD bundle. Run `npm run build:mfe` in the canvas repo and use `vite preview` (not `vite dev`) to serve it.

**`single-spa error #1` or `#31` in console**
→ qiankun cannot find the lifecycle exports. Check that `src/app.ts` has `export async function bootstrap/mount/unmount` at module top level, not wrapped inside another function or object.

**CORS error on BFF requests**
→ Check that `meta-bff/src/index.ts`, `graph-canvas/bff.ts`, and `bpmn-canvas/bff.ts` all have the `addHook('onRequest', ...)` block adding `Access-Control-Allow-Origin: *`, and that `app.register(cors, ...)` has been removed.

**MFE renders standalone (`:5174`) but not inside the shell**
→ Check `window.__UC_BUS` in the browser console — it should be an object. If `undefined`, the eventbus import in `meta-shell/src/main.ts` is not running. Ensure `window.__UC_BUS = bus` is explicit at the top of `main.ts`.
