// SSR app factory. Globs app/routes/**, mounts each file (default export →
// page wrapped in the layout; named `app`/handlers → Hono sub-app), and
// serves rendered HTML. Mirrors HonoX's createApp signature/shape.

import { type Context, Hono } from "hono";
import { NONCE, secureHeaders } from "hono/secure-headers";
import type { ComponentType, VNode } from "preact";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";
import { createRoutes, type Route, type RouteModule } from "./router.ts";
import { Layout as DefaultLayout, type LayoutProps } from "./layout.tsx";
import { collectIslands } from "./registry.tsx";
import {
  resolveClientEntry,
  resolveIslandUrls,
  type StyleEntry,
  styleUrl,
  type ViteManifest,
} from "./manifest.ts";

/**
 * Build the per-page boot module: imports each rendered island's chunk and calls
 * hydrateIslands with the component + deduped props arrays. Empty ids → "" (zero JS).
 */
export function buildBoot(
  ids: string[],
  props: Record<string, unknown>[],
  urls: Record<string, string>,
  clientEntry: string,
): string {
  if (ids.length === 0) return "";
  const imports = ids.map((id, i) =>
    `import * as m${i} from ${JSON.stringify(urls[id])};`
  );
  const components = ids.map((_id, i) => `m${i}.default`);
  // Escape `<` so a props string value can't break out of the </script>.
  const propsJson = JSON.stringify(props).replace(/</g, "\\u003c");
  return [
    `import { hydrateIslands } from ${JSON.stringify(clientEntry)};`,
    ...imports,
    `hydrateIslands([${components.join(",")}],${propsJson});`,
  ].join("\n");
}

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
  /** Optional layout override (default export of app/routes/_layout.tsx). */
  layout?: ComponentType<LayoutProps>;
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

function isHandlerModule(m: RouteModule): m is RouteModule & { app: Hono } {
  return !!m.app && typeof (m.app as Hono).fetch === "function";
}

export function createApp(options: CreateAppOptions): Hono {
  const app = options.app ?? new Hono();
  const Layout = options.layout ?? DefaultLayout;
  const clientEntry = resolveClientEntry(options.manifest);
  const islandUrls = options.islandUrls ?? {};
  const styles = options.styles ?? [];
  const routes: Route[] = createRoutes(options.routes);

  // Two-pass: collect islands + HTML, then render the shell with the boot script.
  const renderDoc = (
    Page: ComponentType<Record<string, unknown>>,
    props: Record<string, unknown>,
    nonce?: string,
  ): string => {
    const { html: childrenHtml, ids, props: islandProps } = collectIslands(() =>
      renderToString(h(Page, props) as VNode)
    );
    const boot = buildBoot(ids, islandProps, islandUrls, clientEntry);
    const doc = h(
      Layout as ComponentType<LayoutProps>,
      { childrenHtml, boot, nonce, styles } satisfies LayoutProps,
    ) as VNode;
    return "<!DOCTYPE html>" + renderToString(doc);
  };

  // Reads the key Hono's `secureHeaders` middleware sets, so a `script-src
  // 'nonce-…'` directive matches the value stamped on the boot <script>.
  const readNonce = (c: Context): string | undefined =>
    (c.get as (k: string) => unknown)("secureHeadersNonce") as
      | string
      | undefined;

  const dispatch = (route: Route) => async (c: Context) => {
    const mod = await route.load();

    if (isHandlerModule(mod)) {
      // Strip the mount prefix so handler routes stay file-relative
      // (`.post("/")`, not `.post("/api")`).
      const url = new URL(c.req.raw.url);
      url.pathname = url.pathname.slice(route.path.length) || "/";
      return mod.app.fetch(new Request(url, c.req.raw), c.env as never);
    }

    // Pages render GET-only; a non-GET or a sub-path under a page 404s.
    // Compare the *matched pattern* (routePath), so `/:id` pages match `/42`;
    // the wildcard mount registers as `/:id/*`, which won't equal route.path.
    if (c.req.method !== "GET" || c.req.routePath !== route.path) {
      return c.notFound();
    }

    const Page = mod.default as
      | ComponentType<Record<string, unknown>>
      | undefined;
    if (!Page) {
      return c.notFound();
    }

    // A Response short-circuits; any other value merges into props. See PageLoader.
    let data: Record<string, unknown> = {};
    const loader = mod.loader as PageLoader | undefined;
    if (loader) {
      const result = await loader(c);
      if (result instanceof Response) return result;
      if (result) data = result;
    }

    const html = renderDoc(
      Page,
      { params: c.req.param(), ...data },
      readNonce(c),
    );
    return c.html(html);
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
  // `c.notFound()`; `_error` catches thrown errors. Both render in the layout.
  const NotFound = options.notFound;
  if (NotFound) {
    app.notFound((c) => c.html(renderDoc(NotFound, {}, readNonce(c)), 404));
  }
  const ErrorPage = options.error as
    | ComponentType<Record<string, unknown>>
    | undefined;
  if (ErrorPage) {
    app.onError((err, c) =>
      c.html(renderDoc(ErrorPage, { error: err }, readNonce(c)), 500)
    );
  }

  return app;
}

export interface DefineAppOptions {
  /** Route modules from the app's `import.meta.glob` over `app/routes`. */
  routes: Record<string, Loader<RouteModule>>;
  /** Island id → dev URL, from `virtual:chevalier-islands`. */
  devIslandUrls: Record<string, string>;
  /** Build manifest from `virtual:chevalier-manifest`; undefined in dev. */
  manifest?: ViteManifest;
  /**
   * CSS entry source paths to link in <head>, resolved against the manifest.
   * Default `["app/styles.css"]` (the scaffold's Tailwind entry). `[]` to opt out.
   */
  styles?: string[];
  layout?: ComponentType<LayoutProps>;
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
    layout: options.layout,
    notFound: options.notFound,
    error: options.error,
    manifest,
    islandUrls: resolveIslandUrls(options.devIslandUrls, manifest),
    styles: styles.map((src) => styleUrl(src, manifest)),
  });
}

export default defineApp;
