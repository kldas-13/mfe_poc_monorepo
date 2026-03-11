/**
 * meta-ux-shell/src/shell.ts
 * ──────────────────────────
 * REFERENCE FILE — copy this into the meta-ux-shell repo, not compiled here.
 * Excluded from mfe-core tsconfig.json — depends on qiankun + vite installed
 * in the shell repo, not in mfe-core.
 *
 * Shell bootstrap — registers all MFEs with qiankun and sets up shell routes.
 *
 * Pattern: each canvas repo exports its pre-built MFEModel.
 * The shell imports them, hands them to qiankun, and owns the mount containers.
 *
 * NOTE: This file belongs in the meta-ux-shell repo.
 *       It is shown here as a usage reference for MFEComposer (Part 1).
 */

import { registerMicroApps, start } from 'qiankun';
import {
  createEventBus,
  ShellRoutes,
  MFERouteRegistry,
} from '@uc/mfe-core';

// Import the pre-built models from each canvas repo.
// In an npm workspaces monorepo these are local package references.
import { graphCanvasMFE }  from 'graph-canvas/bootstrap';
import { bpmnCanvasMFE }   from 'bpmn-canvas/bootstrap';

// ─── 1. Initialise global EventBus ───────────────────────────────────────────
const bus = createEventBus();

// ─── 2. Register shell-owned routes ──────────────────────────────────────────
ShellRoutes.register({ path: '/',         label: 'Home',     visibleInNav: true  });
ShellRoutes.register({ path: '/settings', label: 'Settings', visibleInNav: true  });
ShellRoutes.register({ path: '/404',      label: 'Not Found',visibleInNav: false });

// ─── 3. Register MFEs with qiankun ───────────────────────────────────────────
// Each MFEModel.config maps directly to qiankun's RegisterApplicationConfig.
// We inject the shared EventBus into every MFE's props so they don't need
// to reach for window.__UC_BUS directly (cleaner, testable).

registerMicroApps(
  [graphCanvasMFE, bpmnCanvasMFE].map(mfe => ({
    ...mfe.config,
    props: {
      ...mfe.config.props,
      eventBus: bus,                      // shared EventBus
      wsEndpoint: mfe.wsEndpoint,         // BFF WS URL
      sseEndpoint: mfe.sseEndpoint,       // BFF SSE URL
    },
  })),
  {
    beforeLoad: [
      async (app: RegistrableApp<Record<string, unknown>>) =>
        console.log(`[shell] before load → ${app.name}`),
    ],
    beforeMount: [
      async (app: RegistrableApp<Record<string, unknown>>) =>
        console.log(`[shell] before mount → ${app.name}`),
    ],
    afterUnmount: [
      async (app: RegistrableApp<Record<string, unknown>>) =>
        console.log(`[shell] after unmount → ${app.name}`),
    ],
  }
);

// ─── 4. Start qiankun ────────────────────────────────────────────────────────
start({
  sandbox: { experimentalStyleIsolation: true },
  prefetch: 'all',                        // prefetch all MFE assets after first load
});

// ─── 5. Dev utility: inspect registered routes ───────────────────────────────
if (import.meta.env.DEV) {
  console.group('[UC] Route Registry');
  console.log('Shell routes:', ShellRoutes.getAll());
  console.log('MFE routes:', MFERouteRegistry.getAll());
  console.groupEnd();
}
