/**
 * MFEModel.ts
 * -----------
 * Core descriptor types for every Micro-Frontend in the Unified Canvas platform.
 *
 * USAGE (inside any canvas repo or the meta-ux-shell):
 *
 *   import type { MFEModel, MFEConfig, MFERoute } from '@uc/mfe-core';
 *
 * These types are the single source of truth for what a registered MFE looks like.
 * The MFEBuilder (see builder/MFEBuilder.ts) is the preferred way to construct them.
 */

// ─── Status ──────────────────────────────────────────────────────────────────

/** Lifecycle state of a mounted micro-frontend. */
export type MFEStatus = 'idle' | 'loading' | 'mounted' | 'unmounted' | 'error';

// ─── Route types ─────────────────────────────────────────────────────────────

/**
 * A single route that belongs to a micro-frontend.
 * Kept intentionally thin — each MFE owns its internal router;
 * this is just enough for the shell to reason about ownership.
 */
export interface MFERoute {
  /** The path pattern this MFE owns, e.g. "/graph" or "/graph/:id". */
  path: string;
  /** Optional human-readable label (used by shell nav / breadcrumbs). */
  label?: string;
  /** Arbitrary metadata (permissions, icons, feature flags, etc.). */
  meta?: Record<string, unknown>;
}

// ─── Qiankun sandbox config ───────────────────────────────────────────────────

export interface MFESandboxConfig {
  /** Strict shadow-DOM style isolation (may break some CSS-in-JS libs). */
  strictStyleIsolation?: boolean;
  /** Scoped CSS isolation via attribute selectors — lighter than strict. */
  experimentalStyleIsolation?: boolean;
}

// ─── Core config (maps 1-to-1 with qiankun's RegisterApplicationConfig) ──────

/**
 * Everything qiankun + the shell needs to mount a micro-frontend.
 *
 * NOTE: `entry` MUST be an absolute URL (e.g. "http://localhost:3001").
 * Relative paths will not work because qiankun embeds MFEs under the shell's
 * origin and relative resolution would break asset loading.
 */
export interface MFEConfig {
  /** Unique app name — used as qiankun's `name` and EventBus namespace prefix. */
  name: string;

  /**
   * Absolute URL to the MFE dev server or deployed asset entry.
   * Examples:
   *   dev  → "http://localhost:3001"
   *   prod → "https://cdn.example.com/graph-canvas/"
   */
  entry: string;

  /**
   * CSS selector of the DOM node the MFE will be mounted into.
   * Must exist in the shell's HTML before registration.
   * Recommendation: use a dedicated `<div id="uc-mfe-{name}">` per app.
   */
  container: string;

  /**
   * Activation rule. The MFE renders when this returns true (or the path matches).
   * Simple path prefix:  activeRule: '/graph'
   * Custom function:     activeRule: (loc) => loc.pathname.startsWith('/graph')
   */
  activeRule: string | ((location: Location) => boolean);

  /**
   * Routes this MFE owns — used by the shell for nav generation and
   * route-conflict detection. Not consumed by qiankun directly.
   */
  routes?: MFERoute[];

  /**
   * Props passed down to the MFE's qiankun lifecycle functions.
   * Typically includes { eventBus, initialState }.
   * Avoid passing large objects — prefer EventBus messages instead.
   */
  props?: Record<string, unknown>;

  /** Qiankun sandbox options. Defaults to `true` (snapshot sandbox). */
  sandbox?: boolean | MFESandboxConfig;
}

// ─── Full MFE Model ───────────────────────────────────────────────────────────

/**
 * The complete runtime model for a registered micro-frontend.
 * Built via MFEBuilder, registered with qiankun via MFEComposer (Part 1).
 */
export interface MFEModel {
  /** Core qiankun registration config. */
  config: MFEConfig;

  /** Current lifecycle status. Managed by MFEComposer at runtime. */
  status: MFEStatus;

  /**
   * EventBus namespace for this MFE.
   * Defaults to the MFE's `config.name` if not explicitly set.
   * All events emitted by this MFE should be prefixed: `{namespace}:eventName`.
   */
  eventBusNamespace: string;

  /**
   * Optional WebSocket endpoint for this MFE's BFF.
   * e.g. "ws://localhost:3001/ws"
   * Consumed by the WSClient (see ws/WSClient.ts).
   */
  wsEndpoint?: string;

  /**
   * Optional SSE endpoint for server-sent events from this MFE's BFF.
   * e.g. "http://localhost:3001/events"
   */
  sseEndpoint?: string;
}
