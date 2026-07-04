// Public API for Chevalier — a Deno meta-framework structured like HonoX, with
// a Preact view layer and full-reload-on-route-change in dev.

export { buildBoot, defineApp } from "./server.ts";
export type { DefineAppOptions, PageAction, PageLoader } from "./server.ts";

export {
  resolveClientEntry,
  resolveIslandUrl,
  resolveIslandUrls,
  styleUrl,
} from "./manifest.ts";
export type {
  StyleEntry,
  ViteManifest,
  ViteManifestChunk,
} from "./manifest.ts";

export { Layout, Stylesheets } from "./layout.tsx";
export type { LayoutProps } from "./layout.tsx";

export { hydrateIslands } from "./client.ts";
export type { IslandProps, IslandRegistry } from "./client.ts";

export { collectIslands, island } from "./registry.tsx";

export { createRoutes, fileToPath } from "./router.ts";
export type { Route, RouteModule } from "./router.ts";

export { isIsland, islandId, normalizePath } from "./islands.ts";

// The Vite plugin (chevalier/chevalierConfig) ships from the `chevalier/vite`
// entry, not here: it imports @deno/vite-plugin → a wasm loader, and re-exporting
// it would drag that into the SSR runtime bundle that imports this barrel.
