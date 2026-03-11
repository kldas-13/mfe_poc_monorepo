import { MicroAppConfig } from '../types'

/**
 * Injected early in <body> before any module scripts.
 *
 * Creates deferred promises for each qiankun lifecycle hook and exposes them
 * on window[appName] so the host app can call them as soon as the child
 * registers. Also wires up an optional event bus and props injection.
 */
export const createQiankunHelper = (config: MicroAppConfig): string => {
    const { name, communication = {}, hooks = {} } = config
    const {
        enableEventBus = false,
        eventBusKey = '__MICRO_APP_EVENT_BUS__',
        injectProps = false,
    } = communication

    const hasHooks = Object.keys(hooks).length > 0

    return `
(function() {
  // ── Deferred promise factory ──────────────────────────────────────────────
  // window.proxy is guaranteed to exist at this point because Qiankun creates
  // the sandbox and sets window.proxy BEFORE executing any scripts in the child.
  // We still guard defensively and fall back to plain window for standalone runs.
  const sandbox = window.proxy || window;

  const createDeferred = (hookName) => {
    let _resolve;
    const d = new Promise((resolve) => { _resolve = resolve; });
    // Register the resolver on the sandbox so lifecycleResolver can call it
    sandbox['vite' + hookName] = _resolve;
    return (props) => d.then((fn) => fn(props));
  };

  const bootstrap = createDeferred('bootstrap');
  const mount     = createDeferred('mount');
  const unmount   = createDeferred('unmount');
  const update    = createDeferred('update');

  // ── Expose lifecycles on window so Qiankun can find them ─────────────────
  // Qiankun looks for window[appName] first (our approach), and also checks
  // ES module exports. We satisfy the window approach here.
  window['${name}'] = { bootstrap, mount, unmount, update };

  ${
      enableEventBus
          ? `
  // ── Shared event bus ──────────────────────────────────────────────────────
  if (!window['${eventBusKey}']) {
    const listeners = {};
    window['${eventBusKey}'] = {
      on(event, fn)       { (listeners[event] = listeners[event] || []).push(fn); },
      off(event, fn)      { listeners[event] = (listeners[event] || []).filter(l => l !== fn); },
      emit(event, payload){ (listeners[event] || []).forEach(fn => fn(payload)); },
    };
  }
  `
          : ''
  }

  ${
      injectProps
          ? `
  // ── Props store ───────────────────────────────────────────────────────────
  window.__MICRO_APP_PROPS__ = window.__MICRO_APP_PROPS__ || {};
  `
          : ''
  }

  ${
      hasHooks
          ? `
  // ── Lifecycle hooks (from plugin config) ─────────────────────────────────
  window.__MICRO_APP_HOOKS__ = window.__MICRO_APP_HOOKS__ || {};
  window.__MICRO_APP_HOOKS__['${name}'] = {
    ${hooks.beforeMount ? `beforeMount:   ${hooks.beforeMount.toString()},` : ''}
    ${hooks.afterMount ? `afterMount:    ${hooks.afterMount.toString()},` : ''}
    ${hooks.beforeUnmount ? `beforeUnmount: ${hooks.beforeUnmount.toString()},` : ''}
    ${hooks.afterUnmount ? `afterUnmount:  ${hooks.afterUnmount.toString()},` : ''}
  };
  `
          : ''
  }
})();
`.trim()
}
