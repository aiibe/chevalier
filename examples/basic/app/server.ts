// SSR entry. Globs routes + the convention pages and hands them to defineApp,
// which owns manifest, island-URL, and CSP wiring. Exported default is a Hono
// app consumed by the dev server / build.

// vite/client augments ImportMeta with `glob`/`env`, which Deno doesn't know.
/// <reference types="vite/client" />

import { defineApp } from "chevalier";
import type { RouteModule } from "chevalier";
// Dev URLs + build manifest; defineApp resolves hashed chunks from them.
import { urls as devIslandUrls } from "virtual:chevalier-islands";
import { manifest } from "virtual:chevalier-manifest";
import Layout from "./routes/_layout.tsx";
import NotFound from "./routes/_404.tsx";
import ErrorPage from "./routes/_error.tsx";

export default defineApp({
  routes: import.meta.glob<RouteModule>(
    "/app/routes/**/*.{tsx,jsx,ts}",
    { eager: false },
  ) as Record<string, () => Promise<RouteModule>>,
  devIslandUrls,
  manifest,
  layout: Layout,
  notFound: NotFound,
  error: ErrorPage,
});
