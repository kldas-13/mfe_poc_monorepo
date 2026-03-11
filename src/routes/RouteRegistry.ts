/**
 * RouteRegistry.ts
 * ----------------
 * Centralised route management for the entire Unified Canvas platform.
 *
 * There are two distinct concerns this file addresses:
 *
 *   1. SHELL ROUTES  — top-level routes the meta-ux-shell owns exclusively
 *                      (e.g. /login, /home, 404 page, settings).
 *
 *   2. MFE ROUTES    — routes owned and rendered by micro-frontends.
 *                      The shell only needs to know the *prefix* (activeRule)
 *                      so it can activate the correct MFE; the MFE handles
 *                      its own deep routing internally.
 *
 * WHY centralise here?
 *   • One place to audit for route conflicts.
 *   • Shell nav / breadcrumb generation reads from this registry.
 *   • New MFE developers declare routes via `MFERouteRegistry.register()`
 *     instead of scattering config across multiple repos.
 *
 * USAGE
 * ─────
 *   Shell developer:
 *     import { ShellRoutes } from '@uc/mfe-core';
 *     ShellRoutes.register({ path: '/settings', label: 'Settings' });
 *
 *   MFE developer (in their repo's bootstrap/index.ts):
 *     import { MFERouteRegistry } from '@uc/mfe-core';
 *     MFERouteRegistry.register('graph-canvas', [
 *       { path: '/graph',       label: 'Graph Explorer' },
 *       { path: '/graph/:id',   label: 'Node Detail'    },
 *     ]);
 *
 *   Anyone reading routes:
 *     MFERouteRegistry.getAll();   // all MFE routes, flat
 *     MFERouteRegistry.getFor('graph-canvas');
 *     ShellRoutes.getAll();
 */

import type { MFERoute } from '../model/MFEModel.js';

// ─── Shell Route ──────────────────────────────────────────────────────────────

/**
 * A route that the meta-ux-shell renders itself (no MFE involved).
 * These are never passed to qiankun.
 */
export interface ShellRoute {
  /** URL path, e.g. "/home", "/settings", "/404". */
  path: string;
  /** Display label for navigation and breadcrumbs. */
  label: string;
  /**
   * Whether to show in primary navigation.
   * Useful for hiding utility pages like /404 from nav menus.
   */
  visibleInNav?: boolean;
  /** Arbitrary metadata — permissions, icons, feature flags, etc. */
  meta?: Record<string, unknown>;
}

// ─── Shell Route Registry ─────────────────────────────────────────────────────

/**
 * Static registry for routes the shell itself owns.
 * Shell developer is the only one who should call `.register()` here.
 */
export class ShellRoutes {
  private static routes: Map<string, ShellRoute> = new Map();

  /**
   * Register a shell-owned route.
   * Throws if the path is already registered (prevents silent overwrites).
   */
  static register(route: ShellRoute): void {
    if (ShellRoutes.routes.has(route.path)) {
      throw new Error(
        `[ShellRoutes] Path "${route.path}" is already registered. ` +
        `Call ShellRoutes.replace() if overriding is intentional.`
      );
    }
    ShellRoutes.routes.set(route.path, route);
  }

  /** Replace an existing shell route (safe override). */
  static replace(route: ShellRoute): void {
    ShellRoutes.routes.set(route.path, route);
  }

  /** Unregister a shell route by path. */
  static unregister(path: string): void {
    ShellRoutes.routes.delete(path);
  }

  /** Return all registered shell routes. */
  static getAll(): ShellRoute[] {
    return Array.from(ShellRoutes.routes.values());
  }

  /** Return only routes that appear in the primary navigation. */
  static getNavRoutes(): ShellRoute[] {
    return ShellRoutes.getAll().filter(r => r.visibleInNav !== false);
  }

  /** Check if a path is a known shell route. */
  static has(path: string): boolean {
    return ShellRoutes.routes.has(path);
  }

  /**
   * Given a current `window.location.pathname`, find the matching shell route.
   * Returns undefined if the path belongs to an MFE.
   */
  static match(pathname: string): ShellRoute | undefined {
    return ShellRoutes.getAll().find(r => pathname === r.path || pathname.startsWith(r.path + '/'));
  }
}

// ─── MFE Route Registry ───────────────────────────────────────────────────────

/**
 * Registry of routes belonging to each registered micro-frontend.
 * MFE developers call `MFERouteRegistry.register()` in their bootstrap file.
 * The shell reads this registry for nav generation and conflict detection.
 */
export class MFERouteRegistry {
  /** mfeName → route list */
  private static registry: Map<string, MFERoute[]> = new Map();

  /**
   * Register routes for a micro-frontend.
   *
   * Call this ONCE per MFE, typically in the same place you define your
   * MFEBuilder chain (e.g. `src/bootstrap.ts` in the canvas repo).
   *
   * @param mfeName   Must match the `name` in MFEConfig exactly.
   * @param routes    Routes this MFE owns.
   * @param override  Set to true to replace an existing registration (useful in HMR).
   */
  static register(mfeName: string, routes: MFERoute[], override = false): void {
    if (MFERouteRegistry.registry.has(mfeName) && !override) {
      console.warn(
        `[MFERouteRegistry] "${mfeName}" routes already registered. ` +
        `Pass override=true or call unregister() first.`
      );
      return;
    }
    MFERouteRegistry.registry.set(mfeName, routes);
    MFERouteRegistry.assertNoConflicts();
  }

  /** Unregister all routes for an MFE (e.g. on unmount in dev mode). */
  static unregister(mfeName: string): void {
    MFERouteRegistry.registry.delete(mfeName);
  }

  /** Get routes for a specific MFE. */
  static getFor(mfeName: string): MFERoute[] {
    return MFERouteRegistry.registry.get(mfeName) ?? [];
  }

  /** Get all MFE routes across all registered micro-frontends, flat. */
  static getAll(): Array<MFERoute & { mfeName: string }> {
    const result: Array<MFERoute & { mfeName: string }> = [];
    MFERouteRegistry.registry.forEach((routes, mfeName) => {
      routes.forEach(r => result.push({ ...r, mfeName }));
    });
    return result;
  }

  /** Return names of all registered MFEs. */
  static getMFENames(): string[] {
    return Array.from(MFERouteRegistry.registry.keys());
  }

  /**
   * Detect duplicate paths across different MFEs and warn.
   * Called automatically on every `register()`.
   */
  private static assertNoConflicts(): void {
    const seen = new Map<string, string>(); // path → mfeName
    MFERouteRegistry.registry.forEach((routes, mfeName) => {
      routes.forEach(route => {
        if (seen.has(route.path)) {
          console.error(
            `[MFERouteRegistry] CONFLICT: path "${route.path}" is claimed by ` +
            `both "${seen.get(route.path)}" and "${mfeName}".`
          );
        } else {
          seen.set(route.path, mfeName);
        }
      });
    });
  }
}

// ─── Pre-built shell routes for meta-ux-shell ─────────────────────────────────
// Shell developer: uncomment and expand as needed.
// These are the routes the shell renders without delegating to any MFE.

/*
ShellRoutes.register({ path: '/',          label: 'Home',     visibleInNav: true  });
ShellRoutes.register({ path: '/settings',  label: 'Settings', visibleInNav: true  });
ShellRoutes.register({ path: '/404',       label: 'Not Found',visibleInNav: false });
*/

// ─── Pre-built MFE route declarations ────────────────────────────────────────
// Each canvas repo calls MFERouteRegistry.register() in its own bootstrap.
// These are shown here as documentation / examples only.

/*
// In graph-canvas repo → src/bootstrap.ts:
MFERouteRegistry.register('graph-canvas', [
  { path: '/graph',       label: 'Graph Explorer'  },
  { path: '/graph/:id',   label: 'Node Detail'     },
]);

// In bpmn-canvas repo → src/bootstrap.ts:
MFERouteRegistry.register('bpmn-canvas', [
  { path: '/bpmn',        label: 'BPMN Editor'     },
  { path: '/bpmn/:id',    label: 'BPMN Diagram'    },
]);
*/
