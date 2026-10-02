/**
 * dsh-refresh — web client bundle.
 *
 * Mounts a "刷新" button into the sidebar footer action list
 * (`sidebar.footer.action`, the same list slot that Settings uses). Pressing it
 * does two things so a newly installed plugin takes effect WITHOUT restarting
 * the desktop app:
 *
 *   1. Refreshes the plugin inventory through the host's plugin-manager
 *      remotes (`listBundles()` + `listPlugins()`), matching what the built-in
 *      plugin-manager "刷新" button does.
 *   2. Reloads the page (`window.location.reload()`). The host re-renders the
 *      SPA `index.html` on every request with the CURRENT boot manifest (the
 *      injection rows reflect the active `cordis.patch.yml`/installed bundles),
 *      so a reload re-bootstraps the client and executes any newly added client
 *      bundles.
 *
 * Reloading the page is the safety net: even if the plugin-manager remotes are
 * absent or the inventory call fails, the reload alone re-reads the boot graph
 * and picks up new client bundles. The built-in DSH HMR already live-applies
 * newly installed bundles via `ctx.remote.pluginManager`; this button makes that
 * reachable with a single click and guarantees a page reload on top.
 *
 * The module system requires a full page reload to replace the bootstrap module
 * (client-modules throws "...requires a page reload" for that case), so
 * `window.location.reload()` is the correct primitive here — never an in-place
 * invalidation.
 *
 * The registration shape mirrors the working `dsh-session-multiselect` client
 * bundle: `window.__ModuleLoader__.load({ id, factory })`, `inject` names the
 * Cordis services the client root must provide (note the added `remote` and
 * `remote.pluginManager`), `apply(ctx)` mounts the slot entry and locale
 * dictionaries, and the entry reads its own React tree through
 * `useSyncExternalStore`.
 */

window.__ModuleLoader__.load({
  id: 'dsh-refresh',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    const react = require('react');
    const { jsx } = require('react/jsx-runtime');

    // ------------------------------------------------------------------
    // Locale
    // ------------------------------------------------------------------

    const NS = 'dshRefresh';

    const zh = {
      'entry.label': '刷新',
      'entry.tip': '刷新页面与插件，使新安装的插件立即生效',
      'confirm.title': '刷新',
      'confirm.body': '将刷新插件列表并重新加载页面，使新安装的插件生效。当前会话视图会被重载。',
      'confirm.ok': '刷新',
      'confirm.cancel': '取消',
      'busy': '正在刷新…页面即将重新加载。',
      'fail': '刷新失败：{reason}'
    };

    const en = {
      'entry.label': 'Refresh',
      'entry.tip': 'Refresh the page and plugins so newly installed plugins take effect',
      'confirm.title': 'Refresh',
      'confirm.body': 'This refreshes the plugin list and reloads the page so newly installed plugins take effect. The current session view will reload.',
      'confirm.ok': 'Refresh',
      'confirm.cancel': 'Cancel',
      'busy': 'Refreshing… the page is about to reload.',
      'fail': 'Refresh failed: {reason}'
    };

    // ------------------------------------------------------------------
    // Styles
    // ------------------------------------------------------------------

    const STYLE_ID = 'dsh-refresh/styles';
    const CSS = `
.dsh-rfb-button{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;background:transparent;border:none;border-radius:50%;color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0;flex:none;-webkit-app-region:no-drag;user-select:none;-webkit-user-drag:none}
.dsh-rfb-button:hover{background:var(--dsw-alias-interactive-bg-hover,#0000000d);color:var(--dsw-alias-label-primary)}
.dsh-rfb-button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4d6bfe);outline-offset:1px}
.dsh-rfb-button[aria-busy="true"]{animation:dsh-rfb-spin 1s linear infinite}
@keyframes dsh-rfb-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.dsh-rfb-status{font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary,#d92d20);white-space:pre-wrap}
.dsh-rfb-status[data-tone="error"]{color:var(--dsw-alias-state-error-primary,#d92d20)}
.dsh-rfb-footer{display:flex;justify-content:flex-end;gap:8px;padding-top:4px}
`;

    function installStyles() {
      if (typeof document === 'undefined') return;
      if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`) !== null) return;
      const tag = document.createElement('style');
      tag.dataset.plugin = 'dsh-refresh';
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    // ------------------------------------------------------------------
    // Icon
    // ------------------------------------------------------------------

    /**
     * A clean, well-known "refresh" glyph (material "refresh"), drawn inline so
     * a primitives icon rename can never turn the button into a broken graphic.
     */
    function RefreshGlyph(props) {
      return jsx('svg', {
        width: props?.size ?? 16,
        height: props?.size ?? 16,
        viewBox: '0 0 24 24',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': 'true',
        focusable: 'false',
        children: jsx('path', {
          fill: 'currentColor',
          d: 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z'
        })
      });
    }

    // ------------------------------------------------------------------
    // Refresh action
    // ------------------------------------------------------------------

    /**
     * Refresh the plugin inventory via the host plugin-manager remotes. This is
     * best-effort: the page reload (which actually makes newly installed client
     * bundles visible) always runs even if this throws or the services are absent.
     *
     * @param {object} ctx - the client plugin context.
     * @returns {Promise<void>}
     */
    function refreshPlugins(ctx) {
      const pm = ctx?.remote?.pluginManager;
      if (!pm || typeof pm.listBundles !== 'function') {
        // Plugin-manager remote not available in this host; the reload alone
        // still re-reads the boot manifest, so this is not fatal.
        return Promise.resolve();
      }
      // Matches the built-in plugin-manager "刷新": re-read both the bundles
      // list and the enabled-plugins list so the UI reflects the current state.
      return Promise.all([pm.listBundles(), pm.listPlugins()])
        .then(() => undefined)
        .catch((err) => {
          if (typeof console !== 'undefined') {
            console.warn('[dsh-refresh] plugin inventory refresh failed (non-fatal):', err);
          }
        });
    }

    // ------------------------------------------------------------------
    // Component
    // ------------------------------------------------------------------

    /**
     * The footer entry: a refresh-icon button beside Settings. On press it asks
     * for confirmation (so an accidental tap cannot reload the page), then
     * refreshes the plugin inventory and reloads the page.
     */
    function RefreshEntry({ t, tip, icon, refresh, onTranslate }) {
      react.useEffect(() => {
        if (typeof onTranslate === 'function') onTranslate(t);
      }, [t, onTranslate]);
      const [state, setState] = react.useState('idle'); // idle | confirm | busy
      const [error, setError] = react.useState(null);

      const doRefresh = () => {
        setState('busy');
        setError(null);
        refresh()
          .then(() => {
            // Give the inventory read a beat to settle, then reload the page so
            // the host re-renders the boot manifest with any new client bundle.
            setTimeout(() => {
              if (typeof window !== 'undefined') window.location.reload();
            }, 200);
          })
          .catch((err) => {
            // Extremely unlikely (refreshPlugins never rejects), but keep the
            // UI honest and still leave reload as the fallback.
            setError(err instanceof Error ? err.message : String(err));
            setState('idle');
          });
      };

      const confirmText = typeof t === 'function' ? t : (key) => zh[key] ?? key;
      const open = state === 'confirm' || state === 'busy';
      const busy = state === 'busy';
      return jsx(react.Fragment, { children: [
        tip(confirmText('entry.tip'), jsx('button', {
          type: 'button',
          className: 'dsh-rfb-button',
          draggable: false,
          'aria-label': confirmText('entry.label'),
          'aria-busy': busy ? 'true' : undefined,
          onClick: () => { setState('confirm'); setError(null); },
          children: jsx(icon, { size: 16 })
        }), 'right'),
        jsx(primitives.Modal, {
          open,
          onClose: () => { if (!busy) setState('idle'); },
          title: confirmText(busy ? 'busy' : 'confirm.title'),
          closeLabel: confirmText('confirm.cancel'),
          description: busy ? undefined : confirmText('confirm.body'),
          children: error === null ? null
            : jsx('div', { className: 'dsh-rfb-status', 'data-tone': 'error', children: confirmText('fail', { reason: error }) }),
          footer: busy ? undefined : jsx('div', {
            className: 'dsh-rfb-footer',
            children: [
              jsx(primitives.Button, { size: 'sm', variant: 'primary', onClick: doRefresh, children: confirmText('confirm.ok') }),
              jsx(primitives.Button, { size: 'sm', onClick: () => setState('idle'), children: confirmText('confirm.cancel') })
            ]
          })
        })
      ] });
    }

    // ------------------------------------------------------------------
    // Plugin
    // ------------------------------------------------------------------

    /**
     * Services required before the entry can mount and refresh plugins:
     * `remote` + `remote.pluginManager` expose the host plugin-manager remotes.
     */
    const inject = ['slots', 'locale', 'remote', 'remote.pluginManager'];

    /** Mount the refresh button into the sidebar footer action slot. */
    function apply(ctx) {
      installStyles();

      const icon = RefreshGlyph;
      const tip = (label, child, side) => (typeof primitives.Tooltip === 'function'
        ? jsx(primitives.Tooltip, { label, delayMs: 400, ...(side === undefined ? {} : { side }), children: child })
        : child);

      // The translator the component reads while the slot has not provided one.
      const localT = (key, params) => {
        const id = (() => {
          try { return String(ctx.locale?.getSnapshot?.()?.active ?? ''); } catch { return ''; }
        })();
        const dict = id.toLowerCase().startsWith('en') ? en : zh;
        const template = dict[key] ?? en[key] ?? zh[key] ?? key;
        if (params === undefined) return template;
        return template.replace(/\{(\w+)\}/gu, (match, name) => (params[name] === undefined ? match : String(params[name])));
      };
      let translate = localT;

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-refresh: dictionaries');
      ctx.effect(() => () => {
        if (typeof document === 'undefined') return;
        const tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`);
        if (tag !== null) tag.remove();
      }, 'dsh-refresh: styles teardown');

      try {
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'dsh-refresh',
          locale: NS,
          inject: () => ({
            t: translate,
            tip,
            icon,
            refresh: () => refreshPlugins(ctx),
            onTranslate: (fn) => { translate = fn; }
          })
        }, RefreshEntry));
      } catch (error) {
        // The slot may be absent in a non-desktop host; nothing to fall back to
        // here (the button is the whole feature), so this must not sink apply.
        if (typeof console !== 'undefined') console.warn('dsh-refresh: footer entry failed', error);
      }
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.RefreshGlyph = RefreshGlyph;
    exports.RefreshEntry = RefreshEntry;
    return module.exports;
  }
});