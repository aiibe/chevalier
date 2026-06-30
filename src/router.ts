// File-route discovery + matching. Maps `app/routes/**` files to URL paths,
// HonoX-style. Non-island route files contribute pages/handlers; islands and
// convention files (`_*`) are excluded from the route table.

import { normalizePath } from "./islands.ts";

export interface RouteModule {
  // A default-exported Preact component → rendered page.
  default?: unknown;
  // A Hono sub-app or handlers, HonoX-style.
  app?: unknown;
}

export interface Route {
  /** URL path, e.g. "/", "/about", "/blog/:slug". */
  path: string;
  /** App-root-relative source path, e.g. "routes/index.tsx". */
  file: string;
  load: () => Promise<RouteModule>;
}

/** `_*` files are framework convention, not routes (e.g. _layout, _404). */
function isConventionFile(name: string): boolean {
  return name.startsWith("_");
}

/** Reduce any path to its "routes/..." tail (drops an app-root prefix). */
function toRoutesRelative(p: string): string {
  const i = p.indexOf("routes/");
  return i === -1 ? p : p.slice(i);
}

/**
 * Convert an app-root-relative route file path to a URL path.
 * - `routes/index.tsx` → `/`
 * - `routes/about.tsx` → `/about`
 * - `routes/blog/index.tsx` → `/blog`
 * - `routes/blog/[slug].tsx` → `/blog/:slug`
 */
export function fileToPath(file: string): string {
  let p = normalizePath(file)
    .replace(/^routes\//, "")
    .replace(/\.(tsx|jsx|ts|js)$/, "");

  // [slug] → :slug, [...rest] → :rest{.+}. Hono has no `*`-suffix param,
  // so catch-all uses the `{.+}` regex form to stay a named param.
  p = p
    .split("/")
    .map((seg) =>
      seg
        .replace(/^\[\.\.\.(.+)\]$/, ":$1{.+}")
        .replace(/^\[(.+)\]$/, ":$1")
    )
    .join("/");

  p = p.replace(/\/?index$/, "");
  return "/" + p.replace(/^\//, "");
}

/** `modules` is app-root-relative path → loader (e.g. from import.meta.glob). */
export function createRoutes(
  modules: Record<string, () => Promise<RouteModule>>,
): Route[] {
  const routes: Route[] = [];
  for (const [rawFile, load] of Object.entries(modules)) {
    const file = toRoutesRelative(normalizePath(rawFile));
    if (!file.startsWith("routes/")) continue;
    const name = file.slice(file.lastIndexOf("/") + 1);
    if (isConventionFile(name)) continue;
    // $-prefixed colocated islands are not routes.
    if (name.startsWith("$")) continue;
    // Drop test/spec/type files; component pages and .ts handlers both stay.
    if (/(\.(test|spec)\.(tsx|jsx|ts|js)|\.d\.ts)$/.test(name)) continue;
    routes.push({ path: fileToPath(file), file, load });
  }
  // Static segments before dynamic ones so `/about` beats `/:slug`.
  routes.sort((a, b) => specificity(b.path) - specificity(a.path));
  return routes;
}

/** Higher = more specific (fewer dynamic segments wins). */
function specificity(path: string): number {
  const segs = path.split("/").filter(Boolean);
  let score = segs.length * 10;
  for (const s of segs) {
    // Catch-all (`:rest{.+}`) is least specific, then plain dynamic params.
    if (s.startsWith(":")) score -= s.includes("{") ? 5 : 3;
  }
  return score;
}
