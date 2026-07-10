// SSR app factory. Globs app/routes/**, mounts each file (default export →
// page wrapped in the layout; named `app`/handlers → Hono sub-app), and
// serves rendered HTML. Mirrors HonoX's createApp signature/shape.

import { type Context, Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { NONCE, secureHeaders } from "hono/secure-headers";
import { routePath } from "hono/route";
import type { ComponentType } from "preact";
import {
  createLayouts,
  createMiddleware,
  createRoutes,
  type Layout,
  type LayoutModule,
  type Middleware,
  type MiddlewareModule,
  type Route,
  type RouteModule,
} from "./router.ts";
import { App as DefaultApp, type LayoutProps } from "./layout.tsx";
import { createRenderer } from "./render.ts";
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
   * routes). Body-only chrome for a directory + subtree; ancestors compose
   * (nest) outer→inner inside the app shell. A route with no `_layout` ancestor
   * renders bare in the shell.
   */
  layouts?: Record<string, Loader<LayoutModule>>;
  /**
   * The app shell (default export of app/routes/_app.tsx): the single
   * <html>/<head>/<body> document wrapping every page. Falls back to the
   * built-in App. Layouts (layouts) compose inside its <body>.
   */
  appShell?: ComponentType<LayoutProps>;
  /** id → client URL for every island (dev URL, or hashed chunk for a build). */
  islandUrls?: Record<string, string>;
  /** Optional 404 page (default export of app/routes/_404.tsx). Rendered in the app shell with status 404. */
  notFound?: ComponentType<Record<string, unknown>>;
  /** Optional error page (default export of app/routes/_error.tsx). Receives `error`; rendered with status 500. */
  error?: ComponentType<{ error: unknown }>;
  /** Parsed `.vite/manifest.json`; resolves the client entry to its hashed chunk. */
  manifest?: ViteManifest;
  /** Resolved stylesheets, provided to <Head>/<Stylesheets> via context (defineApp maps `styles`). */
  styles?: StyleEntry[];
  /** Base Hono app to mount onto (default: new Hono). */
  app?: Hono;
}

/**
 * A page loader: runs before render, receiving the Hono context. Return a plain
 * object to merge into the page props, or a Response to short-circuit render
 * (redirect, 404, custom status). May be async — render stays sync.
 *
 * Parameterize the payload — `PageLoader<{ greeting: string }>` — to type the
 * data through to the page via `PageProps<typeof loader>`.
 */
export type PageLoader<
  T extends Record<string, unknown> = Record<string, unknown>,
> = (
  c: Context,
) =>
  | Response
  | T
  | void
  | Promise<Response | T | void>;

/**
 * The props a page receives: the loader's payload plus the injected route
 * `params`. Use `PageProps<typeof loader>` so the page can't drift from the
 * loader's return shape. With no loader, it's just `{ params }`.
 */
export type PageProps<L = PageLoader> = {
  params: Record<string, string>;
} & LoaderData<L>;

// The payload merged into props (line 201): the loader's plain-object return,
// with Response/void dropped.
type LoaderData<L> = L extends (...args: never[]) => infer R
  ? Awaited<R> extends infer A
    ? A extends Record<string, unknown> ? A : Record<never, never>
  : Record<never, never>
  : Record<never, never>;

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

// Actions buffer the whole body (formData) — cap it; bigger uploads belong in
// a handler module. Direct 413, else a custom _error page turns it into a 500.
const actionBodyLimit = bodyLimit({
  maxSize: 1024 * 1024,
  onError: (c) => c.text("Payload Too Large", 413),
});

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
  const AppShell = options.appShell ?? DefaultApp;

  const { loadLayouts, renderDoc, readNonce } = createRenderer({
    layouts,
    AppShell,
    islandUrls,
    clientEntry,
    styles,
  });

  // Canonicalize before anything matches: `/about/` 308s to `/about` (308
  // keeps the method, so a form POST survives). Routes register slash-less,
  // so the slashed form would otherwise fall into the wildcard and 404.
  app.use("*", async (c, next) => {
    const url = new URL(c.req.url);
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      const path = url.pathname.replace(/\/+$/, "") || "/";
      return c.redirect(path + url.search, 308);
    }
    await next();
  });

  // Mount before routes: Hono runs use() in registration order, and
  // createMiddleware sorts shallowest-first, so guards compose outer-to-inner.
  // Hono's `/admin/*` matches `/admin` itself too, so one wildcard covers the
  // dir index and its subtree.
  for (const { prefix, load } of middleware) {
    const handler: MiddlewareHandler = async (c, next) =>
      ((await load()).default as PageMiddleware)(c, next);
    app.use(prefix === "/" ? "*" : `${prefix}/*`, handler);
  }

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
    // Same-path non-GET → the page's action (form POST); else 404. HEAD must
    // render: Hono matched it as GET and strips the body, but c.req.method
    // still reads HEAD — without this a monitor's HEAD would hit the action.
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const action = mod.action as PageAction | undefined;
      if (!action) return c.notFound();
      // Actions mutate: reject cross-origin form posts (CSRF).
      if (!isSameOrigin(c)) return c.text("Forbidden", 403);
      // Exactly one of these is set: `rejected` on exceed, `res` otherwise.
      let res: Response | undefined;
      const rejected = await actionBodyLimit(c, async () => {
        res = await action(c);
      });
      return res ?? (rejected as Response);
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

    const Layouts = await loadLayouts(route.path);
    const props = { params: c.req.param(), ...data };
    const html = renderDoc(
      Layouts,
      Page,
      props,
      { url: new URL(c.req.url).pathname, path: route.path, data: props },
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
  // `c.notFound()`; `_error` catches thrown errors. Both render in the layouts
  // resolved from the request path (an unmatched /admin/x gets the admin chrome).
  const NotFound = options.notFound;
  if (NotFound) {
    app.notFound(async (c) => {
      const url = new URL(c.req.url).pathname;
      const Layouts = await loadLayouts(url);
      return c.html(
        renderDoc(
          Layouts,
          NotFound,
          {},
          { url, path: undefined, data: {} },
          readNonce(c),
        ),
        404,
      );
    });
  }
  const ErrorPage = options.error as
    | ComponentType<Record<string, unknown>>
    | undefined;
  if (ErrorPage) {
    app.onError(async (err, c) => {
      // Replacing Hono's default handler loses its logging; keep the operator log.
      console.error(err);
      const url = new URL(c.req.url).pathname;
      const Layouts = await loadLayouts(url);
      return c.html(
        renderDoc(
          Layouts,
          ErrorPage,
          { error: err },
          { url, path: undefined, data: { error: err } },
          readNonce(c),
        ),
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
  /** `_layout.tsx` modules from a glob over `app/routes` (all ancestors nest). */
  layouts?: Record<string, Loader<LayoutModule>>;
  /** The app shell (default export of `app/routes/_app.tsx`); the built-in App if omitted. */
  app?: ComponentType<LayoutProps>;
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
    appShell: options.app,
    notFound: options.notFound,
    error: options.error,
    manifest,
    islandUrls: resolveIslandUrls(options.devIslandUrls, manifest),
    styles: styles.map((src) => styleUrl(src, manifest)),
  });
}

export default defineApp;
