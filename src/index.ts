/**
 * @uc/mfe-core
 * ============
 * Shared foundation for every micro-frontend in the Unified Canvas platform.
 *
 * Install (npm workspaces):
 *   npm install @uc/mfe-core --workspace=<canvas-repo>
 *
 * Usage:
 *   import { MFEBuilder, createEventBus, WSClient, ShellRoutes, MFERouteRegistry } from '@uc/mfe-core';
 */

// ── Model ──────────────────────────────────────────────────────────────────────
export type {
  MFEModel,
  MFEConfig,
  MFERoute,
  MFESandboxConfig,
  MFEStatus,
} from './model/MFEModel.js';

// ── Builder ────────────────────────────────────────────────────────────────────
export { MFEBuilder, MFEBuilderError } from './builder/MFEBuilder.js';

// ── Routes ─────────────────────────────────────────────────────────────────────
export type { ShellRoute } from './routes/RouteRegistry.js';
export { ShellRoutes, MFERouteRegistry } from './routes/RouteRegistry.js';

// ── EventBus ───────────────────────────────────────────────────────────────────
export type {
  IEventBus,
  INamespacedBus,
  EventHandler,
  EventPayload,
  QualifiedEvent,
} from './eventbus/EventBus.js';
export { createEventBus, getEventBus } from './eventbus/EventBus.js';

// ── WebSocket Client ───────────────────────────────────────────────────────────
export type {
  WSMessage,
  WSMessageHandler,
  WSConnectionState,
  WSConnectionHandler,
  WSClientOptions,
} from './ws/WSClient.js';
export { WSClient } from './ws/WSClient.js';
