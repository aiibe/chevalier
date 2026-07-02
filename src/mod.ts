// Public API for Chevalier — a Deno meta-framework structured like HonoX, with
// a Preact view layer and full-reload-on-route-change in dev.

export { buildBoot, createApp } from "./server.ts";
export type { CreateAppOptions, PageLoader } from "./server.ts";

export {
  resolveClientEntry,
  resolveIslandUrl,
  resolveIslandUrls,
} from "./manifest.ts";
export type { ViteManifest, ViteManifestChunk } from "./manifest.ts";

export { Layout } from "./layout.tsx";
export type { LayoutProps } from "./layout.tsx";

export { hydrateIslands } from "./client.ts";
export type { IslandProps, IslandRegistry } from "./client.ts";

export { collectIslands, island } from "./registry.tsx";

export { createRoutes, fileToPath } from "./router.ts";
export type { Route, RouteModule } from "./router.ts";

export { isIsland, islandId, normalizePath } from "./islands.ts";

export { chevalier } from "./vite.ts";
export type { ChevalierOptions } from "./vite.ts";
