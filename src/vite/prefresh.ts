// Island HMR via @prefresh/vite. v3's factory is async and returns a plugin
// array we register as-is, scoped to islands/ via prefresh's own include filter.

import type { PluginOption } from "vite";

// Fast-refresh scope: islands/*.tsx|jsx only (routes are server-owned reloads).
// Shared with vite.ts's oxc.jsxRefreshInclude — the two scopes MUST match, else
// Oxc injects $RefreshReg$ into non-islands whose defining prelude never ran.
export const ISLAND_INCLUDE = /(?:^|\/)islands\/.+\.[jt]sx$/;

type PrefreshFactory = (opts: {
  include?: RegExp;
  exclude?: RegExp;
}) => Promise<PluginOption>;

async function loadPrefresh(): Promise<PrefreshFactory | null> {
  try {
    // CJS outside src/, so a bare-specifier import fails Vite's import-analysis;
    // resolve to a file:// URL instead.
    const m = await import(
      /* @vite-ignore */ import.meta.resolve("@prefresh/vite")
    );
    const factory = (m as { default?: unknown }).default ?? m;
    return typeof factory === "function" ? (factory as PrefreshFactory) : null;
  } catch {
    return null;
  }
}

/**
 * Island fast-refresh plugins, scoped to islands/, or a warning-only stub when
 * @prefresh/vite is absent (islands still reload-swap, just losing state).
 * Returned flat so callers spread it into the plugin array.
 */
export async function islandPrefresh(
  // Test seam: override the @prefresh/vite factory loader.
  loadFactory: () => Promise<PrefreshFactory | null> = loadPrefresh,
): Promise<PluginOption[]> {
  const factory = await loadFactory();
  if (!factory) {
    // Absent @prefresh/vite means islands reload-swap and lose state on edit —
    // warn once (via a no-op plugin's buildStart) so the degrade is discoverable.
    let warned = false;
    return [{
      name: "chevalier:prefresh-missing",
      apply: "serve",
      buildStart() {
        if (warned) return;
        warned = true;
        this.warn(
          "island Fast Refresh disabled: add @prefresh/vite " +
            "(+ @prefresh/core, @prefresh/utils) to keep island state across edits.",
        );
      },
    }];
  }
  const plugins = await factory({ include: ISLAND_INCLUDE });
  return Array.isArray(plugins) ? plugins : [plugins];
}
