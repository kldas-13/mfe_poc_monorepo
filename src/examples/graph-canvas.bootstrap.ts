/**
 * graph-canvas/src/bootstrap.ts
 * ──────────────────────────────
 * REFERENCE FILE — copy this into the graph-canvas repo, not compiled here.
 * Excluded from mfe-core tsconfig.json — depends on vite-plugin-qiankun
 * installed in the canvas repo, not in mfe-core.
 *
 * Entry point for the graph-canvas micro-frontend.
 *
 * TWO MODES:
 *  1. Standalone dev  — `useDevMode()` from vite-plugin-qiankun is active,
 *                        this file IS the app entry; qiankun lifecycle fns
 *                        are exported for the shell to call.
 *
 *  2. Shell-embedded  — qiankun calls bootstrap/mount/unmount directly.
 *
 * The MFE definition (graphCanvasMFE) is exported so the meta-ux-shell can
 * import it and pass it to MFEComposer.register() without duplicating config.
 */

import { renderMicroApp, useDevMode } from 'vite-plugin-qiankun/es/helper';
import {
  MFEBuilder,
  createEventBus,
  getEventBus,
  WSClient,
} from '@uc/mfe-core';

// ─── 1. Build the MFE model (single source of truth for this canvas) ──────────

export const graphCanvasMFE = new MFEBuilder('graph-canvas')
  /**
   * IMPORTANT: absolute URL only — see MFEModel.ts for why.
   * In real usage, pull from env: import.meta.env.VITE_GRAPH_BFF_URL
   */
  .entry('http://localhost:3001')
  .container('#uc-mfe-graph-canvas')
  .activeRule('/graph')
  .routes([
    { path: '/graph',           label: 'Graph Explorer', meta: { icon: 'graph' } },
    { path: '/graph/:id',       label: 'Node Detail'                             },
    { path: '/graph/:id/edit',  label: 'Edit Node',      meta: { hidden: true }  },
  ])
  .wsEndpoint('ws://localhost:3001/ws')
  .sseEndpoint('http://localhost:3001/events')
  .sandbox({ experimentalStyleIsolation: true })
  .props({ version: '0.1.0' })
  .build();

// ─── 2. Internal state (per mount) ───────────────────────────────────────────

let wsClient: WSClient | null = null;

// ─── 3. Qiankun lifecycle exports ────────────────────────────────────────────

/**
 * bootstrap — called once when qiankun first loads the MFE.
 * Use for one-time setup that does NOT depend on the DOM.
 */
export async function bootstrap(): Promise<void> {
  console.log('[graph-canvas] bootstrap');
}

/**
 * mount — called each time the MFE becomes active.
 * Receives props injected by the shell (including the shared EventBus).
 */
export async function mount(props: Record<string, unknown>): Promise<void> {
  console.log('[graph-canvas] mount', props);

  // ── EventBus: prefer the one from shell props, fall back to window.__UC_BUS ──
  // In dev-standalone mode the shell hasn't initialised the bus, so we create one.
  if (!window.__UC_BUS) {
    createEventBus();
  }
  const bus = getEventBus();
  const ns = bus.namespace('graph-canvas');

  // Listen to cross-MFE events
  ns.on('node-selected', (payload) => {
    console.log('[graph-canvas] received node-selected from bus:', payload);
    // Update Graphology / Sigma.js graph here
  });

  // ── WebSocket: connect to BFF ──────────────────────────────────────────────
  wsClient = new WSClient({
    url: graphCanvasMFE.wsEndpoint!,
    namespace: graphCanvasMFE.eventBusNamespace,
    bridgeToEventBus: true,  // WS messages flow into EventBus automatically
  });

  wsClient
    .onConnectionChange((state) => {
      ns.emit('ws-state', { state });
    })
    .on('graph:sync', ({ payload }) => {
      console.log('[graph-canvas] graph:sync received', payload);
      // Hydrate Graphology store
    })
    .on('graph:node-update', ({ payload }) => {
      console.log('[graph-canvas] node update', payload);
    });

  // ── Render the actual app ──────────────────────────────────────────────────
  renderMicroApp(props);
}

/**
 * unmount — called when the MFE is deactivated (route change away).
 * MUST clean up all resources: DOM, WS, EventBus listeners.
 */
export async function unmount(props: Record<string, unknown>): Promise<void> {
  console.log('[graph-canvas] unmount', props);

  // Clean up EventBus listeners for this namespace
  getEventBus().namespace('graph-canvas').destroy();

  // Disconnect WebSocket
  wsClient?.destroy();
  wsClient = null;
}

// ─── 4. Dev standalone mode ───────────────────────────────────────────────────
// When running `vite dev` directly (not inside the shell), useDevMode()
// makes vite-plugin-qiankun emit a synthetic qiankun lifecycle so this file
// behaves exactly as it would when embedded.

if (useDevMode()) {
  // In standalone dev, bootstrap+mount with empty props
  bootstrap().then(() => mount({}));
}
