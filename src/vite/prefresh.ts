// Island HMR via @prefresh/vite, scoped to island sources in serve mode only.

import type { Plugin } from "vite";
import { isIsland } from "../islands.ts";
import { appRel } from "./reload.ts";

// @prefresh/vite is CJS outside src/, so a bare-specifier import fails Vite's
// import-analysis; resolve via import.meta.resolve to a file:// URL instead.
type TransformFn = (...args: unknown[]) => unknown;
let prefreshTransform: Promise<TransformFn | null> | undefined;
function loadPrefreshTransform(): Promise<TransformFn | null> {
  prefreshTransform ??= (async () => {
    try {
      const m = await import(
        /* @vite-ignore */ import.meta.resolve("@prefresh/vite")
      );
      const factory = (m as { default?: unknown }).default ?? m;
      const plugin = typeof factory === "function" ? factory() : null;
      const t = (plugin as { transform?: unknown } | null)?.transform;
      return typeof t === "function" ? (t as TransformFn) : null;
    } catch {
      return null;
    }
  })();
  return prefreshTransform;
}

export function scopedPrefresh(
  appRoot: string,
  isServe: () => boolean,
  // Test seam: override the @prefresh/vite transform loader.
  loadTransform: () => Promise<TransformFn | null> = loadPrefreshTransform,
): Plugin {
  let warned = false;
  return {
    name: "chevalier:prefresh",
    async transform(
      this: unknown,
      code: string,
      id: string,
      txOpts?: { ssr?: boolean },
    ) {
      // Prefresh's HMR hooks only exist in the dev runtime; running it during
      // `vite build` would corrupt island chunks (now their own build inputs).
      if (!isServe() || txOpts?.ssr) return;
      const rel = appRel(id, appRoot);
      if (rel === null || !isIsland(rel)) return;
      const transform = await loadTransform();
      if (!transform) {
        // Absent @prefresh/vite means islands reload-swap and lose state on
        // edit — warn once so the silent degrade is discoverable.
        if (!warned) {
          warned = true;
          (this as { warn(msg: string): void }).warn(
            "island Fast Refresh disabled: add @prefresh/vite " +
              "(+ @prefresh/core, @prefresh/utils) to keep island state across edits.",
          );
        }
        return;
      }
      return transform.call(this, code, id, txOpts);
    },
  } as Plugin;
}
