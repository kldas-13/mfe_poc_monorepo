import { MicroAppConfig } from '../types'

/**
 * Injected into the `.finally()` of the last dynamic import.
 *
 * Once all module scripts have finished loading, this code:
 *  1. Reads the real lifecycle fns from window.moudleQiankunAppLifeCycles
 *  2. Resolves the deferred promises created by the helper script
 *  3. Runs any before/after hooks configured by the app
 */
export const createLifecycleResolver = (config: MicroAppConfig): string => {
    const { name, communication = {} } = config
    const { injectProps = false } = communication

    return `
(function(moduleExports) {
  const appName  = '${name}';
  const sandbox  = window.proxy || window;
  const appHooks = (window.__MICRO_APP_HOOKS__ || {})[appName] || {};

  // ── Resolve lifecycle source ──────────────────────────────────────────────
  // Priority 1: ES module exports from the child's entry (moduleExports arg)
  // Priority 2: window[appName] set by the child app manually
  // This covers both "export { bootstrap, mount, unmount }" and manual window assignment.
  const lifecycle = (
    moduleExports && moduleExports.bootstrap && moduleExports.mount
      ? moduleExports
      : window[appName]
  );

  if (!lifecycle || !lifecycle.mount) {
    console.error('[qiankun-plugin] No lifecycle found for "' + appName + '". ' +
      'Make sure your entry file exports bootstrap, mount, and unmount.');
    return;
  }

  // ── Hook wrapper ──────────────────────────────────────────────────────────
  const withHooks = (before, fn, after) => async (props) => {
    if (before) await Promise.resolve(before(props));
    const result = await Promise.resolve(fn(props));
    if (after) await Promise.resolve(after(props));
    return result;
  };

  // ── Resolve the deferred promises set up by qiankunHelper ────────────────
  // sandbox['vite<Hook>'] holds the Promise resolver function.
  if (sandbox.vitebootstrap) {
    sandbox.vitebootstrap(() =>
      lifecycle.bootstrap ? lifecycle.bootstrap() : Promise.resolve()
    );
  }

  if (sandbox.vitemount) {
    sandbox.vitemount(
      withHooks(
        appHooks.beforeMount,
        (props) => {
          ${injectProps ? `(window.__MICRO_APP_PROPS__ || (window.__MICRO_APP_PROPS__ = {}))['${name}'] = props;` : ''}
          return lifecycle.mount(props);
        },
        appHooks.afterMount,
      )
    );
  }

  if (sandbox.viteunmount) {
    sandbox.viteunmount(
      withHooks(
        appHooks.beforeUnmount,
        (props) => lifecycle.unmount(props),
        appHooks.afterUnmount,
      )
    );
  }

  if (sandbox.viteupdate && lifecycle.update) {
    sandbox.viteupdate((props) => {
      ${injectProps ? `(window.__MICRO_APP_PROPS__ || (window.__MICRO_APP_PROPS__ = {}))['${name}'] = props;` : ''}
      return lifecycle.update(props);
    });
  }
})(typeof __LIFECYCLE_MODULE__ !== 'undefined' ? __LIFECYCLE_MODULE__ : undefined);
`.trim()
}
