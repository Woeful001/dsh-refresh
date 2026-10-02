/**
 * dsh-refresh — Node half (intentional no-op).
 *
 * The feature is entirely browser-side: a "刷新" button that refreshes the
 * plugin inventory and reloads the page so newly installed plugins take effect
 * without restarting the desktop app. There is nothing for the host process to
 * own — this entry exists only so the bundle's `cordis.patch.yml` row names a
 * real, loadable Cordis plugin instead of a dangling module.
 *
 * @module dsh-refresh
 */

/** Stable Cordis plugin name. */
export const name = 'dsh-refresh'

/** No host services are consumed: the plugin contributes nothing to the host. */
export const inject = []

/**
 * Mount the plugin. Intentionally a no-op (see the module doc comment); the
 * client bundle installed through `dsh.client` carries the whole feature.
 */
export function apply() {}