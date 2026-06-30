// SSR entry. Globs routes + the layout override, then hands them to
// createApp. Exported default is a Hono app consumed by the dev server / build.

// vite/client augments ImportMeta with `glob`/`env`, which Deno doesn't know.
/// <reference types="vite/client" />

import { createApp, resolveIslandUrls } from "chevalier";
import type { RouteModule, ViteManifest } from "chevalier";
// Dev URLs; resolveIslandUrls rewrites to hashed chunks for build.
import { urls as devIslandUrls } from "virtual:chevalier-islands";
import Layout from "./routes/_layout.tsx";
import NotFound from "./routes/_404.tsx";
import ErrorPage from "./routes/_error.tsx";

const routes = import.meta.glob<RouteModule>(
  "/app/routes/**/*.{tsx,jsx,ts}",
  { eager: false },
) as Record<string, () => Promise<RouteModule>>;

// Eager + PROD-guarded so the manifest is inlined at build time only.
const manifest = import.meta.env.PROD
  ? (Object.values(
    import.meta.glob<{ default: ViteManifest }>(
      "/dist/client/.vite/manifest.json",
      { eager: true },
    ),
  )[0]?.default)
  : undefined;

const app = createApp({
  routes,
  layout: Layout,
  notFound: NotFound,
  error: ErrorPage,
  manifest,
  islandUrls: resolveIslandUrls(devIslandUrls, manifest),
});

export default app;
