/**
 * MFEBuilder.ts
 * -------------
 * Fluent builder for constructing MFEModel instances with qiankun configuration.
 *
 * This is the PRIMARY way developers should declare a micro-frontend.
 * It enforces required fields, applies sensible defaults, and produces a fully
 * typed MFEModel ready for registration with qiankun via MFEComposer (Part 1).
 *
 * USAGE
 * ─────
 *   In graph-canvas repo → src/bootstrap.ts:
 *
 *     import { MFEBuilder, MFERouteRegistry } from '@uc/mfe-core';
 *
 *     export const graphCanvasMFE = new MFEBuilder('graph-canvas')
 *       .entry(import.meta.env.VITE_BFF_URL ?? 'http://localhost:3001')
 *       .container('#uc-mfe-graph-canvas')
 *       .activeRule('/graph')
 *       .routes([
 *         { path: '/graph',     label: 'Graph Explorer' },
 *         { path: '/graph/:id', label: 'Node Detail'    },
 *       ])
 *       .wsEndpoint('ws://localhost:3001/ws')
 *       .sseEndpoint('http://localhost:3001/events')
 *       .props({ initialTheme: 'dark' })
 *       .sandbox({ experimentalStyleIsolation: true })
 *       .build();
 *
 *   In meta-ux-shell → src/shell.ts:
 *
 *     import { graphCanvasMFE } from 'graph-canvas/bootstrap';
 *     // OR import the pre-built model from the shared package if you publish it.
 *
 *     MFEComposer.register(graphCanvasMFE);
 */

import type {
  MFEModel,
  MFEConfig,
  MFERoute,
  MFESandboxConfig,
  MFEStatus,
} from '../model/MFEModel.js';

import { MFERouteRegistry } from '../routes/RouteRegistry.js';

// ─── Validation error ─────────────────────────────────────────────────────────

export class MFEBuilderError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(`[MFEBuilder] ${message}`);
    this.name = 'MFEBuilderError';
  }
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export class MFEBuilder {
  // Required
  private readonly _name: string;
  private _entry?: string;
  private _container?: string;
  private _activeRule?: string | ((location: Location) => boolean);

  // Optional with defaults
  private _routes: MFERoute[] = [];
  private _props: Record<string, unknown> = {};
  private _sandbox: boolean | MFESandboxConfig = { experimentalStyleIsolation: true };
  private _eventBusNamespace?: string;
  private _wsEndpoint?: string;
  private _sseEndpoint?: string;
  private _registerRoutes = true;

  /**
   * @param name Unique identifier for this MFE. Must be stable across deploys.
   *             Convention: `{product}-{concern}`, e.g. "graph-canvas", "bpmn-canvas".
   */
  constructor(name: string) {
    if (!name || typeof name !== 'string') {
      throw new MFEBuilderError('name must be a non-empty string.', 'name');
    }
    this._name = name;
  }

  // ── Required fields ────────────────────────────────────────────────────────

  /**
   * Absolute URL of the MFE's BFF / asset server.
   *
   * IMPORTANT: Must be an absolute URL (not a relative path).
   * Use environment variables to switch between dev and prod:
   *   .entry(import.meta.env.VITE_GRAPH_CANVAS_URL ?? 'http://localhost:3001')
   */
  entry(url: string): this {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new MFEBuilderError(
        `entry URL must be absolute (start with http:// or https://). Got: "${url}". ` +
        `Relative URLs will not work under qiankun's execution context.`,
        'entry'
      );
    }
    this._entry = url;
    return this;
  }

  /**
   * CSS selector for the mount point DOM node.
   * This element must exist in the shell's HTML before qiankun starts.
   *
   * Convention: `#uc-mfe-{name}` (e.g. "#uc-mfe-graph-canvas")
   */
  container(selector: string): this {
    this._container = selector;
    return this;
  }

  /**
   * Qiankun activation rule.
   * The MFE is mounted when this rule matches the current location.
   *
   * String form (path prefix):
   *   .activeRule('/graph')  — activates for /graph, /graph/*, etc.
   *
   * Function form (full control):
   *   .activeRule(loc => loc.pathname.startsWith('/graph') && !loc.pathname.startsWith('/graph-old'))
   */
  activeRule(rule: string | ((location: Location) => boolean)): this {
    this._activeRule = rule;
    return this;
  }

  // ── Optional fields ────────────────────────────────────────────────────────

  /**
   * Declare the routes this MFE owns.
   * Automatically registers them in MFERouteRegistry unless you call
   * `.skipRouteRegistration()` on the builder.
   */
  routes(routes: MFERoute[]): this {
    this._routes = routes;
    return this;
  }

  /**
   * Props passed to the MFE's qiankun lifecycle functions (bootstrap/mount/unmount).
   * Prefer EventBus messages over large prop objects.
   * The EventBus instance is automatically injected as `props.eventBus`.
   */
  props(props: Record<string, unknown>): this {
    this._props = { ...this._props, ...props };
    return this;
  }

  /**
   * Qiankun sandbox configuration.
   * Default: { experimentalStyleIsolation: true }
   *
   * Use `false` to disable the sandbox entirely (not recommended for production).
   * Use `{ strictStyleIsolation: true }` for full shadow-DOM isolation
   * (may break CSS-in-JS libraries — test carefully).
   */
  sandbox(config: boolean | MFESandboxConfig): this {
    this._sandbox = config;
    return this;
  }

  /**
   * Override the EventBus namespace.
   * Defaults to the MFE's `name` if not set.
   * Event names emitted by this MFE should follow: `{namespace}:{eventName}`.
   */
  eventBusNamespace(ns: string): this {
    this._eventBusNamespace = ns;
    return this;
  }

  /**
   * WebSocket endpoint for this MFE's BFF.
   * e.g. 'ws://localhost:3001/ws'
   * Passed to WSClient inside the MFE's mount lifecycle.
   */
  wsEndpoint(url: string): this {
    this._wsEndpoint = url;
    return this;
  }

  /**
   * SSE (Server-Sent Events) endpoint for this MFE's BFF.
   * e.g. 'http://localhost:3001/events'
   */
  sseEndpoint(url: string): this {
    this._sseEndpoint = url;
    return this;
  }

  /**
   * Prevent this builder from auto-registering routes in MFERouteRegistry.
   * Use when you prefer to call MFERouteRegistry.register() manually.
   */
  skipRouteRegistration(): this {
    this._registerRoutes = false;
    return this;
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  /**
   * Validate and produce an immutable MFEModel.
   * Throws MFEBuilderError if any required field is missing.
   */
  build(): Readonly<MFEModel> {
    // ── Validation ──
    if (!this._entry) {
      throw new MFEBuilderError('entry() is required.', 'entry');
    }
    if (!this._container) {
      throw new MFEBuilderError('container() is required.', 'container');
    }
    if (this._activeRule === undefined) {
      throw new MFEBuilderError('activeRule() is required.', 'activeRule');
    }

    // ── Auto-register routes ──
    if (this._registerRoutes && this._routes.length > 0) {
      MFERouteRegistry.register(this._name, this._routes, true);
    }

    const config: MFEConfig = {
      name: this._name,
      entry: this._entry,
      container: this._container,
      activeRule: this._activeRule,
      routes: this._routes.length > 0 ? [...this._routes] : undefined,
      props: { ...this._props },
      sandbox: this._sandbox,
    };

    const model: MFEModel = {
      config,
      status: 'idle' as MFEStatus,
      eventBusNamespace: this._eventBusNamespace ?? this._name,
      wsEndpoint: this._wsEndpoint,
      sseEndpoint: this._sseEndpoint,
    };

    return Object.freeze(model);
  }
}
