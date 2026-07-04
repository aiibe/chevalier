// File-route discovery + matching. Maps `app/routes/**` files to URL paths,
// HonoX-style. Non-island route files contribute pages/handlers; islands and
// convention files (`_*`) are excluded from the route table.

import {
  isLayout,
  isMiddleware,
  normalizePath,
  ROUTE_EXT_RE,
  TEST_SPEC_RE,
} from "./islands.ts";

export interface RouteModule {
  // A default-exported Preact component → rendered page.
  default?: unknown;
  // A Hono sub-app or handlers, HonoX-style.
  app?: unknown;
  // Optional data loader run before render; its result merges into page props.
  // Returning a Response short-circuits render (redirect, 404, custom status).
  loader?: unknown;
  // Write hook run on non-GET at the page's own path; returns a Response. See README.
  action?: unknown;
}

export interface Route {
  /** URL path, e.g. "/", "/about", "/blog/:slug". */
  path: string;
  /** App-root-relative source path, e.g. "routes/index.tsx". */
  file: string;
  load: () => Promise<RouteModule>;
}

/** A `_middleware.ts` module: its default export is a Hono MiddlewareHandler. */
export interface MiddlewareModule {
  default?: unknown;
}

export interface Middleware {
  /** URL prefix the middleware guards, e.g. "/", "/admin". Covers it + children. */
  prefix: string;
  /** App-root-relative source path, e.g. "routes/admin/_middleware.ts". */
  file: string;
  load: () => Promise<MiddlewareModule>;
}

/** A `_layout.tsx` module: its default export is the document-shell component. */
export interface LayoutModule {
  default?: unknown;
}

export interface Layout {
  /** URL prefix the layout shells, e.g. "/", "/admin". Covers it + children. */
  prefix: string;
  /** App-root-relative source path, e.g. "routes/admin/_layout.tsx". */
  file: string;
  load: () => Promise<LayoutModule>;
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
    .replace(ROUTE_EXT_RE, "");

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

/**
 * URL prefix a convention file (`_middleware`, `_layout`) guards, from its dir:
 * - `routes/_middleware.ts` → `/`
 * - `routes/admin/_layout.tsx` → `/admin`
 * - `routes/blog/[slug]/_middleware.ts` → `/blog/:slug`
 */
export function conventionDirToPath(file: string): string {
  const dir = normalizePath(file).replace(/\/?_[^/]+\.[^/]+$/, "");
  // `routes` (root dir) → fileToPath yields "/"; nested dirs map like a page path.
  return fileToPath(dir === "routes" ? "routes/index.tsx" : `${dir}/index.tsx`);
}

// Compiles a route file to a pathname matcher. Hoist out of a per-client loop:
// the regex depends only on `file`. `file` is app-root-relative (`routes/[slug].tsx`).
export function compileRouteMatcher(
  file: string,
): (pathname: string) => boolean {
  const pattern = fileToPath(file); // e.g. "/blog/:slug", "/files/:rest{.+}"
  const source = "^" + pattern
    .split("/")
    .map((seg) => {
      // :rest{.+} catch-all → greedy across slashes; :slug → one segment.
      if (/^:.+\{.+\}$/.test(seg)) return "(?:.+)";
      if (seg.startsWith(":")) return "(?:[^/]+)";
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/") +
    "/?$";
  const re = new RegExp(source);
  return (pathname) => re.test(pathname);
}

// Scopes a dev route-edit reload to browsers on that route.
export function routeMatchesPath(file: string, pathname: string): boolean {
  return compileRouteMatcher(file)(pathname);
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
    // Drop test/spec/type files; component pages and .ts handlers both stay.
    if (TEST_SPEC_RE.test(name) || name.endsWith(".d.ts")) continue;
    routes.push({ path: fileToPath(file), file, load });
  }
  // Static segments before dynamic ones so `/about` beats `/:slug`.
  routes.sort((a, b) => specificity(b.path) - specificity(a.path));
  return routes;
}

/** `modules` is app-root-relative path → loader, same glob the routes use. */
export function createMiddleware(
  modules: Record<string, () => Promise<MiddlewareModule>>,
): Middleware[] {
  const mw: Middleware[] = [];
  for (const [rawFile, load] of Object.entries(modules)) {
    const file = toRoutesRelative(normalizePath(rawFile));
    if (!file.startsWith("routes/") || !isMiddleware(file)) continue;
    mw.push({ prefix: conventionDirToPath(file), file, load });
  }
  // Shallowest first so Hono's registration-order use() composes outer-to-inner.
  mw.sort((a, b) => depth(a.prefix) - depth(b.prefix));
  return mw;
}

/** `modules` is app-root-relative path → loader, same glob the routes use. */
export function createLayouts(
  modules: Record<string, () => Promise<LayoutModule>>,
): Layout[] {
  const layouts: Layout[] = [];
  for (const [rawFile, load] of Object.entries(modules)) {
    const file = toRoutesRelative(normalizePath(rawFile));
    if (!file.startsWith("routes/") || !isLayout(file)) continue;
    layouts.push({ prefix: conventionDirToPath(file), file, load });
  }
  // Deepest first so resolveLayout's first prefix match is the nearest ancestor.
  layouts.sort((a, b) => depth(b.prefix) - depth(a.prefix));
  return layouts;
}

/**
 * The nearest ancestor layout for a route path: deepest prefix that the path
 * falls under, or undefined (caller uses the built-in default shell). No
 * composition — a nested _layout replaces its ancestors. See TODO.md.
 */
export function resolveLayout(
  routePath: string,
  layouts: Layout[],
): Layout | undefined {
  return layouts.find((l) => underPrefix(routePath, l.prefix));
}

/** True iff `path` is `prefix` itself or nested beneath it (segment-aware). */
function underPrefix(path: string, prefix: string): boolean {
  if (prefix === "/") return true;
  return path === prefix || path.startsWith(prefix + "/");
}

function depth(path: string): number {
  return path.split("/").filter(Boolean).length;
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
