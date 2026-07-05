// SSR app factory. Globs app/routes/**, mounts each file (default export →
// page wrapped in the layout; named `app`/handlers → Hono sub-app), and
// serves rendered HTML. Mirrors HonoX's createApp signature/shape.

import { type Context, Hono, type MiddlewareHandler } from "hono";
import { NONCE, secureHeaders } from "hono/secure-headers";
import { routePath } from "hono/route";
import type { ComponentType, VNode } from "preact";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import {
  createLayouts,
  createMiddleware,
  createRoutes,
  type Layout,
  type LayoutModule,
  type Middleware,
  type MiddlewareModule,
  resolveLayout,
  type Route,
  type RouteModule,
} from "./router.ts";
import {
  Layout as DefaultLayout,
  type LayoutProps,
  PageBody,
} from "./layout.tsx";
import { buildBoot } from "./boot.ts";
import { collectIslands } from "./registry.tsx";
import {
  resolveClientEntry,
  resolveIslandUrls,
  type StyleEntry,
  styleUrl,
  type ViteManifest,
} from "./manifest.ts";

type Loader<T> = () => Promise<T>;

// Factory options. Not in the public API (mod.ts) — apps use defineApp; these
// are the resolved inputs (islandUrls mapped, manifest extracted) it hands in.
// Exported for the co-located test only.
export interface CreateAppOptions {
  /**
   * Route modules, app-root-relative path → loader. In Vite this is produced
   * by an `import.meta.glob` over `app/routes` (all `.tsx`/`.jsx`/`.ts`).
   */
  routes: Record<string, Loader<RouteModule>>;
  /**
   * `_middleware.ts` modules, app-root-relative path → loader (same glob as
   * routes). Each guards its directory + everything under it, composed
   * outer-to-inner, running before page/handler dispatch.
   */
  middleware?: Record<string, Loader<MiddlewareModule>>;
  /**
   * `_layout.tsx` modules, app-root-relative path → loader (same glob as
   * routes). Each is a full document shell for its directory + subtree; the
   * nearest ancestor wins with no composition (a nested layout replaces its
   * ancestors). Routes with no `_layout` ancestor use the built-in shell.
   */
  layouts?: Record<string, Loader<LayoutModule>>;
  /** id → client URL for every island (dev URL, or hashed chunk for a build). */
  islandUrls?: Record<string, string>;
  /** Optional 404 page (default export of app/routes/_404.tsx). Rendered in the layout with status 404. */
  notFound?: ComponentType<Record<string, unknown>>;
  /** Optional error page (default export of app/routes/_error.tsx). Receives `error`; rendered with status 500. */
  error?: ComponentType<{ error: unknown }>;
  /** Parsed `.vite/manifest.json`; resolves the client entry to its hashed chunk. */
  manifest?: ViteManifest;
  /** Resolved stylesheets, injected into every layout render (defineApp maps `styles`). */
  styles?: StyleEntry[];
  /** Base Hono app to mount onto (default: new Hono). */
  app?: Hono;
}

/**
 * A page loader: runs before render, receiving the Hono context. Return a plain
 * object to merge into the page props, or a Response to short-circuit render
 * (redirect, 404, custom status). May be async — render stays sync.
 */
export type PageLoader = (
  c: Context,
) =>
  | Response
  | Record<string, unknown>
  | void
  | Promise<Response | Record<string, unknown> | void>;

/**
 * A page write hook: runs on a non-GET request at the page's own path (form
 * POST). Returns a Response (typically `c.redirect(path, 303)` — the browser
 * re-GETs and the loader re-runs). See README's forms section.
 */
export type PageAction = (c: Context) => Response | Promise<Response>;

/**
 * The default export of a `_middleware.ts`: a Hono middleware. Call `next()` to
 * continue, or return a Response (e.g. `c.redirect("/login")`) to short-circuit.
 */
export type PageMiddleware = MiddlewareHandler;

function isHandlerModule(m: RouteModule): m is RouteModule & { app: Hono } {
  return !!m.app && typeof (m.app as Hono).fetch === "function";
}

// Trust a same-origin Sec-Fetch-Site; else the Origin must match. Absent both
// (non-browser client) → allow: a CSRF forgery always rides a real browser.
function isSameOrigin(c: Context): boolean {
  const site = c.req.header("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";
  const origin = c.req.header("origin");
  if (!origin) return true;
  return origin === new URL(c.req.url).origin;
}

export function createApp(options: CreateAppOptions): Hono {
  const app = options.app ?? new Hono();
  const clientEntry = resolveClientEntry(options.manifest);
  const islandUrls = options.islandUrls ?? {};
  const styles = options.styles ?? [];
  const routes: Route[] = createRoutes(options.routes);
  const middleware: Middleware[] = createMiddleware(options.middleware ?? {});
  const layouts: Layout[] = createLayouts(options.layouts ?? {});

  // Resolve a route path to its nearest layout component, loaded + cached.
  // undefined → the built-in shell. See resolveLayout / TODO.md.
  const layoutCache = new Map<string, ComponentType<LayoutProps>>();
  const loadLayout = async (
    routePath: string,
  ): Promise<ComponentType<LayoutProps>> => {
    const match = resolveLayout(routePath, layouts);
    if (!match) return DefaultLayout;
    let Layout = layoutCache.get(match.file);
    if (!Layout) {
      Layout = ((await match.load()).default ??
        DefaultLayout) as ComponentType<LayoutProps>;
      layoutCache.set(match.file, Layout);
    }
    return Layout;
  };

  // Mount before routes: Hono runs use() in registration order, and
  // createMiddleware sorts shallowest-first, so guards compose outer-to-inner.
  // Hono's `/admin/*` matches `/admin` itself too, so one wildcard covers the
  // dir index and its subtree.
  for (const { prefix, load } of middleware) {
    const handler: MiddlewareHandler = async (c, next) =>
      ((await load()).default as PageMiddleware)(c, next);
    app.use(prefix === "/" ? "*" : `${prefix}/*`, handler);
  }

  // Two-pass: collect islands + HTML, then render the shell with the boot script.
  const renderDoc = (
    Layout: ComponentType<LayoutProps>,
    Page: ComponentType<Record<string, unknown>>,
    props: Record<string, unknown>,
    nonce?: string,
  ): string => {
    const { html, ids, props: islandProps } = collectIslands(() =>
      renderToString(h(Page, props) as VNode)
    );
    const boot = buildBoot(ids, islandProps, islandUrls, clientEntry);
    const doc = h(
      Layout,
      {
        children: h(PageBody, { html, boot, nonce }) as VNode,
        styles,
      } satisfies LayoutProps,
    ) as VNode;
    return "<!DOCTYPE html>" + renderToString(doc);
  };

  // Reads the key Hono's `secureHeaders` middleware sets, so a `script-src
  // 'nonce-…'` directive matches the value stamped on the boot <script>.
  const readNonce = (c: Context): string | undefined =>
    (c.get as (k: string) => unknown)("secureHeadersNonce") as
      | string
      | undefined;

  // Delegate to a route file's Hono sub-app. Strip the mount prefix so handler
  // routes stay file-relative (`.post("/")`, not `.post("/api")`).
  const serveHandler = (
    route: Route,
    app: Hono,
    c: Context,
  ): Response | Promise<Response> => {
    const url = new URL(c.req.raw.url);
    url.pathname = url.pathname.slice(route.path.length) || "/";
    return app.fetch(new Request(url, c.req.raw), c.env as never);
  };

  // Serve a page module at its own path: run its action on non-GET, else its
  // loader + render. Sub-paths under a page 404 (handled by the caller).
  const servePage = async (
    route: Route,
    mod: RouteModule,
    c: Context,
  ): Promise<Response> => {
    // Same-path non-GET → the page's action (form POST); else 404.
    if (c.req.method !== "GET") {
      const action = mod.action as PageAction | undefined;
      if (!action) return c.notFound();
      // Actions mutate: reject cross-origin form posts (CSRF).
      if (!isSameOrigin(c)) return c.text("Forbidden", 403);
      return action(c);
    }

    const Page = mod.default as
      | ComponentType<Record<string, unknown>>
      | undefined;
    if (!Page) return c.notFound();

    // A Response short-circuits; any other value merges into props. See PageLoader.
    let data: Record<string, unknown> = {};
    const loader = mod.loader as PageLoader | undefined;
    if (loader) {
      const result = await loader(c);
      if (result instanceof Response) return result;
      if (result) data = result;
    }

    const Layout = await loadLayout(route.path);
    const html = renderDoc(
      Layout,
      Page,
      { params: c.req.param(), ...data },
      readNonce(c),
    );
    return c.html(html);
  };

  const dispatch = (route: Route) => async (c: Context) => {
    const mod = await route.load();
    if (isHandlerModule(mod)) return serveHandler(route, mod.app, c);
    // Compare the *matched pattern*, so `/:id` pages match `/42`; the wildcard
    // mount registers as `/:id/*`, which won't equal route.path.
    if (routePath(c) !== route.path) return c.notFound();
    return servePage(route, mod, c);
  };

  // Exact paths first, then `/*` wildcards, so a handler module's sub-paths
  // (`/api/users`) reach it without a wildcard shadowing a sibling route.
  for (const route of routes) {
    app.all(route.path, dispatch(route));
  }
  for (const route of routes) {
    const prefix = route.path === "/" ? "" : route.path;
    app.all(`${prefix}/*`, dispatch(route));
  }

  // Convention pages. `_404` catches every unmatched route and each page's
  // `c.notFound()`; `_error` catches thrown errors. Both render in the shell
  // resolved from the request path (an unmatched /admin/x gets the admin shell).
  const NotFound = options.notFound;
  if (NotFound) {
    app.notFound(async (c) => {
      const Layout = await loadLayout(new URL(c.req.url).pathname);
      return c.html(renderDoc(Layout, NotFound, {}, readNonce(c)), 404);
    });
  }
  const ErrorPage = options.error as
    | ComponentType<Record<string, unknown>>
    | undefined;
  if (ErrorPage) {
    app.onError(async (err, c) => {
      const Layout = await loadLayout(new URL(c.req.url).pathname);
      return c.html(
        renderDoc(Layout, ErrorPage, { error: err }, readNonce(c)),
        500,
      );
    });
  }

  return app;
}

export interface DefineAppOptions {
  /** Route modules from the app's `import.meta.glob` over `app/routes`. */
  routes: Record<string, Loader<RouteModule>>;
  /** `_middleware.ts` modules from a second glob over `app/routes`. */
  middleware?: Record<string, Loader<MiddlewareModule>>;
  /** Island id → dev URL, from `virtual:chevalier-islands`. */
  devIslandUrls: Record<string, string>;
  /** Build manifest from `virtual:chevalier-manifest`; undefined in dev. */
  manifest?: ViteManifest;
  /**
   * CSS entry source paths to link in <head>, resolved against the manifest.
   * Default `["app/styles.css"]` (the scaffold's Tailwind entry). `[]` to opt out.
   */
  styles?: string[];
  /** `_layout.tsx` modules from a glob over `app/routes` (nearest ancestor wins). */
  layouts?: Record<string, Loader<LayoutModule>>;
  notFound?: ComponentType<Record<string, unknown>>;
  error?: ComponentType<{ error: unknown }>;
}

/**
 * The SSR entry: resolves island URLs from the manifest and, in a build,
 * applies a nonce CSP whose per-request nonce the boot <script> reuses (core
 * owns both ends of the `secureHeadersNonce` contract readNonce reads).
 * Manifest presence marks the build.
 */
export function defineApp(options: DefineAppOptions): Hono {
  const { manifest, styles = ["app/styles.css"] } = options;
  const base = new Hono();
  // Nonce CSP is build-only: Vite's dev server injects an un-nonced
  // /@vite/client that a restrictive script-src would block.
  if (manifest) {
    base.use(
      "*",
      secureHeaders({ contentSecurityPolicy: { scriptSrc: [NONCE] } }),
    );
  }
  return createApp({
    app: base,
    routes: options.routes,
    middleware: options.middleware,
    layouts: options.layouts,
    notFound: options.notFound,
    error: options.error,
    manifest,
    islandUrls: resolveIslandUrls(options.devIslandUrls, manifest),
    styles: styles.map((src) => styleUrl(src, manifest)),
  });
}

export default defineApp;
