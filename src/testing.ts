// App test harness: the SSR Hono app built straight from `app/` on disk, no
// Vite, so plain `deno test` can drive routes via app.request().

import type { Hono } from "hono";
import type { ComponentType } from "preact";
import { fromFileUrl, resolve, toFileUrl } from "@std/path";
import { defineApp } from "./server.ts";
import type { LayoutProps } from "./layout.tsx";
import { normalizePath, ROUTE_EXT_RE, TEST_SPEC_RE } from "./islands.ts";
import type { RouteModule } from "./router.ts";

/**
 * Build the Hono app the dev server would serve, by walking `appDir` (the
 * directory containing `routes/`) instead of Vite's globs. All routing
 * conventions apply; islands render inline. See the README's Testing section.
 */
export async function createTestApp(appDir: string | URL): Promise<Hono> {
  const appPath =
    (appDir instanceof URL ? fromFileUrl(appDir) : resolve(appDir))
      .replace(/\/+$/, "");
  const routesDir = `${appPath}/routes`;

  const files = walk(routesDir);
  if (files === null) {
    throw new Error(
      `[chevalier] no routes/ in ${appPath} — createTestApp expects the app root (the directory containing routes/)`,
    );
  }

  // One map stands in for all three Vite globs (routes, _middleware, _layout);
  // the router filters each view out of it.
  const routes: Record<string, () => Promise<RouteModule>> = {};
  for (const abs of files) {
    if (!ROUTE_EXT_RE.test(abs) || TEST_SPEC_RE.test(abs)) continue;
    const rel = "routes/" + normalizePath(abs.slice(routesDir.length + 1));
    const href = toFileUrl(abs).href;
    routes[rel] = () => import(href) as Promise<RouteModule>;
  }

  return defineApp({
    routes,
    middleware: routes,
    layouts: routes,
    // No island() wrapping without Vite, so no island ever collects a URL.
    devIslandUrls: {},
    app: await conventionDefault<ComponentType<LayoutProps>>(routesDir, "_app"),
    notFound: await conventionDefault<ComponentType<Record<string, unknown>>>(
      routesDir,
      "_404",
    ),
    error: await conventionDefault<ComponentType<{ error: unknown }>>(
      routesDir,
      "_error",
    ),
  });
}

/** All files under `dir`, recursively; null if `dir` itself is unreadable. */
function walk(dir: string): string[] | null {
  let entries: Iterable<Deno.DirEntry>;
  try {
    entries = Deno.readDirSync(dir);
  } catch {
    return null;
  }
  const out: string[] = [];
  for (const entry of entries) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory) out.push(...walk(p) ?? []);
    else out.push(p);
  }
  return out;
}

/** Default export of an app-root convention page (`_app`/`_404`/`_error`), if present. */
async function conventionDefault<T>(
  routesDir: string,
  name: string,
): Promise<T | undefined> {
  const file = `${routesDir}/${name}.tsx`;
  try {
    Deno.statSync(file);
  } catch {
    return undefined;
  }
  return (await import(toFileUrl(file).href)).default as T;
}
