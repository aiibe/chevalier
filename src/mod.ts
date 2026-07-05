// Public API for Chevalier — a Deno meta-framework structured like HonoX, with
// a Preact view layer and full-reload-on-route-change in dev.

export { buildBoot } from "./boot.ts";
export { defineApp } from "./server.ts";
export type {
  DefineAppOptions,
  PageAction,
  PageLoader,
  PageMiddleware,
  PageProps,
} from "./server.ts";

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

export { App, Layout } from "./layout.tsx";
export type { LayoutProps } from "./layout.tsx";
export { Head, PageHead, Stylesheets, StylesProvider } from "./head.tsx";

export { hydrateIslands } from "./client.ts";
export type { IslandProps, IslandRegistry } from "./client.ts";

export { collectIslands, island } from "./registry.tsx";

export {
  createLayouts,
  createMiddleware,
  createRoutes,
  fileToPath,
  resolveLayouts,
} from "./router.ts";
export type {
  Layout as LayoutRoute,
  LayoutModule,
  Middleware,
  MiddlewareModule,
  Route,
  RouteModule,
} from "./router.ts";

export { isIsland, islandId, isLayout, normalizePath } from "./islands.ts";

export { getSession } from "./session.ts";
export type { Session, SessionOptions } from "./session.ts";

// The Vite plugin (chevalier/chevalierConfig) ships from the `chevalier/vite`
// entry, not here: it imports @deno/vite-plugin → a wasm loader, and re-exporting
// it would drag that into the SSR runtime bundle that imports this barrel.
