/**
 * WSClient.ts
 * -----------
 * WebSocket client for Unified Canvas micro-frontends.
 *
 * Each MFE that needs real-time communication with its BFF creates ONE instance
 * of WSClient. The client is:
 *
 *   • Auto-reconnecting with exponential back-off
 *   • Message-typed (incoming messages are dispatched by `type` field)
 *   • EventBus-bridged (optional) — WS messages can be forwarded to
 *     window.__UC_BUS so other MFEs can react without knowing about WebSockets
 *
 * USAGE
 * ─────
 *   In your MFE's bootstrap / qiankun mount lifecycle:
 *
 *     import { WSClient } from '@uc/mfe-core';
 *
 *     const ws = new WSClient({
 *       url: 'ws://localhost:3001/ws',
 *       namespace: 'graph-canvas',
 *       bridgeToEventBus: true,     // forward WS messages to window.__UC_BUS
 *     });
 *
 *     ws.on('graph:update', (msg) => { ... });   // typed message handler
 *     ws.send({ type: 'subscribe', channel: 'nodes' });
 *
 *   In qiankun unmount lifecycle:
 *     ws.destroy();
 *
 * Message format (expected from BFF):
 *   { type: string; payload?: unknown }
 *
 * EventBus event emitted when bridgeToEventBus=true:
 *   `{namespace}:ws:{message.type}`
 */

import { getEventBus } from '../eventbus/EventBus.js';
import type { QualifiedEvent } from '../eventbus/EventBus.js';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Expected shape of every message sent/received over the WS connection. */
export interface WSMessage<T = unknown> {
  type: string;
  payload?: T;
}

export type WSMessageHandler<T = unknown> = (message: WSMessage<T>) => void;

export type WSConnectionState = 'connecting' | 'open' | 'closed' | 'error';

export type WSConnectionHandler = (state: WSConnectionState) => void;

export interface WSClientOptions {
  /** WebSocket URL for the BFF, e.g. "ws://localhost:3001/ws". */
  url: string;
  /**
   * Namespace of the owning MFE (matches MFEConfig.name).
   * Used for EventBus event names and log prefixes.
   */
  namespace: string;
  /**
   * When true, every incoming WS message is forwarded to window.__UC_BUS as:
   *   `{namespace}:ws:{message.type}`
   * Default: false.
   */
  bridgeToEventBus?: boolean;
  /** Initial delay before first reconnect attempt, ms. Default: 1000. */
  reconnectBaseDelayMs?: number;
  /** Maximum reconnect delay, ms. Default: 30_000. */
  reconnectMaxDelayMs?: number;
  /** Maximum number of reconnect attempts. Default: Infinity. */
  maxReconnectAttempts?: number;
  /** WebSocket protocols (rarely needed). */
  protocols?: string | string[];
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class WSClient {
  private ws: WebSocket | null = null;
  private destroyed = false;

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** type → set of handlers */
  private handlers: Map<string, Set<WSMessageHandler>> = new Map();
  private connectionHandlers: Set<WSConnectionHandler> = new Set();

  private readonly opts: Required<WSClientOptions>;

  constructor(options: WSClientOptions) {
    this.opts = {
      bridgeToEventBus: false,
      reconnectBaseDelayMs: 1000,
      reconnectMaxDelayMs: 30_000,
      maxReconnectAttempts: Infinity,
      protocols: [],
      ...options,
    };
    this.connect();
  }

  // ── Connection management ──────────────────────────────────────────────────

  private connect(): void {
    if (this.destroyed) return;

    this.emitConnectionState('connecting');
    this.log(`Connecting to ${this.opts.url} …`);

    try {
      this.ws = new WebSocket(this.opts.url, this.opts.protocols || undefined);
    } catch (err) {
      this.log('Failed to construct WebSocket:', err);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.log('Connection open.');
      this.reconnectAttempts = 0;
      this.emitConnectionState('open');
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.handleRawMessage(event.data);
    };

    this.ws.onerror = (event) => {
      this.log('Socket error:', event);
      this.emitConnectionState('error');
    };

    this.ws.onclose = (event) => {
      this.log(`Connection closed (code=${event.code}, clean=${event.wasClean}).`);
      this.emitConnectionState('closed');
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.reconnectAttempts >= this.opts.maxReconnectAttempts) {
      this.log('Max reconnect attempts reached. Giving up.');
      return;
    }

    const delay = Math.min(
      this.opts.reconnectBaseDelayMs * 2 ** this.reconnectAttempts,
      this.opts.reconnectMaxDelayMs
    );
    this.reconnectAttempts++;
    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}) …`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  // ── Message handling ───────────────────────────────────────────────────────

  private handleRawMessage(raw: unknown): void {
    let message: WSMessage;

    if (typeof raw !== 'string') {
      this.log('Received non-string message — skipping.', raw);
      return;
    }

    try {
      message = JSON.parse(raw) as WSMessage;
    } catch {
      this.log('Failed to parse message as JSON:', raw);
      return;
    }

    if (typeof message.type !== 'string') {
      this.log('Message missing "type" field:', message);
      return;
    }

    // Dispatch to typed handlers
    this.handlers.get(message.type)?.forEach(h => {
      try { h(message); } catch (err) { this.log(`Handler error for "${message.type}":`, err); }
    });

    // Wildcard handlers
    this.handlers.get('*')?.forEach(h => {
      try { h(message); } catch (err) { this.log('Wildcard handler error:', err); }
    });

    // Bridge to EventBus
    if (this.opts.bridgeToEventBus) {
      try {
        const event = `${this.opts.namespace}:ws:${message.type}` as QualifiedEvent;
        getEventBus().emit(event, message.payload);
      } catch {
        // EventBus may not be available yet — fail silently
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register a handler for a specific message type.
   * Use `'*'` to handle all message types.
   *
   * @example
   *   ws.on('graph:update', ({ payload }) => { ... });
   *   ws.on('*', (msg) => console.log('Any WS message:', msg));
   */
  on<T = unknown>(type: string, handler: WSMessageHandler<T>): this {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler as WSMessageHandler);
    return this;
  }

  /** Remove a specific handler. */
  off<T = unknown>(type: string, handler: WSMessageHandler<T>): this {
    this.handlers.get(type)?.delete(handler as WSMessageHandler);
    return this;
  }

  /**
   * Register a one-shot handler.
   */
  once<T = unknown>(type: string, handler: WSMessageHandler<T>): this {
    const wrapper: WSMessageHandler = (msg) => {
      handler(msg as WSMessage<T>);
      this.off(type, wrapper);
    };
    return this.on(type, wrapper);
  }

  /** Subscribe to connection state changes. */
  onConnectionChange(handler: WSConnectionHandler): this {
    this.connectionHandlers.add(handler);
    return this;
  }

  /** Remove a connection state handler. */
  offConnectionChange(handler: WSConnectionHandler): this {
    this.connectionHandlers.delete(handler);
    return this;
  }

  /**
   * Send a typed message to the BFF.
   * Queues message if the connection is not yet open (naive implementation —
   * upgrade to a proper send-queue if your BFF requires strict ordering).
   */
  send<T = unknown>(message: WSMessage<T>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('send() called but socket is not open. Message dropped:', message);
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  /** Current state of the WebSocket connection. */
  get state(): WSConnectionState {
    if (!this.ws) return 'closed';
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING: return 'connecting';
      case WebSocket.OPEN:       return 'open';
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:
      default:                   return 'closed';
    }
  }

  /**
   * Permanently close the connection and clean up all resources.
   * Call this in the qiankun `unmount` lifecycle of your MFE.
   */
  destroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close(1000, 'MFE unmounted');
    this.ws = null;
    this.handlers.clear();
    this.connectionHandlers.clear();
    this.log('Destroyed.');
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private emitConnectionState(state: WSConnectionState): void {
    this.connectionHandlers.forEach(h => {
      try { h(state); } catch { /* swallow */ }
    });
  }

  private log(...args: unknown[]): void {
    console.log(`[WSClient:${this.opts.namespace}]`, ...args);
  }
}
