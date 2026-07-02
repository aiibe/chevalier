// Vite plugin: dev SSR middleware, client/island build inputs, island HMR.
// Routes/_layout full-reload (server-owned SSR); islands HMR via prefresh.

import type { Connect, Plugin, ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";
import { isIsland, islandId, normalizePath } from "./islands.ts";
import { compileRouteMatcher } from "./router.ts";
import { CLIENT_NAME } from "./manifest.ts";

// Requests Vite must handle itself, not the SSR app: its client runtime,
// /@fs and /@id specifiers, source files, HMR pings, and public assets.
const VITE_OWNED = [
  /^\/@/, // /@vite/client, /@fs/, /@id/, /@react-refresh
  /\.[cm]?[jt]sx?($|\?)/, // source modules Vite transforms
  /\?(t|import|html-proxy|raw|url|worker)/, // Vite query suffixes
  /^\/node_modules\//,
  /^\/favicon\.ico$/,
];

// HMR client + a reporter of this browser's route, so a route edit reloads only
// matching tabs. Re-reports on history nav to track client-router path changes.
const DEV_HEAD_INJECT = `
<script type="module" src="/@vite/client"></script>
<script type="module">
import { createHotContext } from "/@vite/client";
const hot = createHotContext("/chevalier:route-reporter");
const report = () => hot.send("chevalier:route", { pathname: location.pathname });
report();
for (const m of ["pushState", "replaceState"]) {
  const orig = history[m];
  history[m] = function () { const r = orig.apply(this, arguments); report(); return r; };
}
addEventListener("popstate", report);
</script>`;

// Connect types req as a bare IncomingMessage without the http augmentations,
// so we narrow to the fields we read structurally.
interface DevReq {
  url?: string;
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  socket: { encrypted?: boolean };
}

/**
 * Dev SSR middleware: ssrLoadModule the entry, run its Hono app's fetch, pipe
 * the Response back, and inject Vite's HMR client into HTML.
 */
function devMiddleware(
  server: ViteDevServer,
  entry: string,
): Connect.NextHandleFunction {
  return async (rawReq, res, next) => {
    const req = rawReq as unknown as DevReq;
    const url = req.url ?? "/";
    if (VITE_OWNED.some((re) => re.test(url))) return next();

    let app: { fetch: (r: Request) => Response | Promise<Response> };
    try {
      const mod = await server.ssrLoadModule(entry);
      app = (mod.default ?? mod.app) as typeof app;
      if (typeof app?.fetch !== "function") {
        throw new Error(`${entry} has no default/app export with a fetch()`);
      }
    } catch (e) {
      if (e instanceof Error) server.ssrFixStacktrace(e);
      return next(e);
    }

    try {
      const proto = req.socket.encrypted ? "https" : "http";
      const request = new Request(
        new URL(url, `${proto}://${req.headers.host ?? "localhost"}`),
        {
          method: req.method,
          headers: req.headers as HeadersInit,
          // GET/HEAD have no body; anything else streams the Node req in.
          body: req.method === "GET" || req.method === "HEAD"
            ? undefined
            : (req as unknown as ReadableStream),
          // @ts-ignore duplex is required by undici for a streaming body.
          duplex: "half",
        },
      );
      const response = await app.fetch(request);
      res.statusCode = response.status;
      const isHtml = /^text\/html/.test(
        response.headers.get("content-type") ?? "",
      );
      response.headers.forEach((v, k) => {
        // content-length is recomputed after we inject the HMR client below.
        if (isHtml && k === "content-length") return;
        res.setHeader(k, v);
      });
      if (isHtml) {
        // Inject Vite's HMR client by string, not transformIndexHtml — the
        // latter rewrites our inline island-boot <script> into an asset proxy.
        const body = (await response.text()).replace(
          "<head>",
          `<head>${DEV_HEAD_INJECT}`,
        );
        res.setHeader(
          "content-length",
          String(new TextEncoder().encode(body).length),
        );
        res.end(body);
      } else {
        res.end(response.body ? await response.text() : undefined);
      }
    } catch (e) {
      next(e);
    }
  };
}

function inputKey(entry: string): string {
  const base = entry.slice(entry.lastIndexOf("/") + 1);
  return base.replace(/\.[^.]+$/, "") || base;
}

/**
 * Discover island sources under `root`, returning id → app-root-relative path.
 * Seeds the client build inputs so each island code-splits into its own chunk.
 */
function discoverIslands(
  root: string,
  appRootRel: string,
): Record<string, string> {
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    let entries: Iterable<Deno.DirEntry>;
    try {
      entries = Deno.readDirSync(dir);
    } catch {
      return out; // dir missing → no inputs
    }
    for (const entry of entries) {
      const p = `${dir}/${entry.name}`;
      if (entry.isDirectory) out.push(...walk(p));
      else out.push(p);
    }
    return out;
  };

  const map: Record<string, string> = {};
  for (const abs of walk(root)) {
    const rel = normalizePath(abs.slice(root.length + 1));
    if (!isIsland(rel)) continue;
    map[islandId(rel)] = `${appRootRel}/${rel}`;
  }
  return map;
}

// @prefresh/vite is CJS outside src/, so a bare-specifier import fails Vite's
// import-analysis; resolve via import.meta.resolve to a file:// URL instead.
type TransformFn = (...args: unknown[]) => unknown;
let prefreshTransform: Promise<TransformFn | null> | undefined;
function loadPrefreshTransform(): Promise<TransformFn | null> {
  prefreshTransform ??= (async () => {
    try {
      const m = await import(
        /* @vite-ignore */ import.meta.resolve("@prefresh/vite")
      );
      const factory = (m as { default?: unknown }).default ?? m;
      const plugin = typeof factory === "function" ? factory() : null;
      const t = (plugin as { transform?: unknown } | null)?.transform;
      return typeof t === "function" ? (t as TransformFn) : null;
    } catch {
      return null;
    }
  })();
  return prefreshTransform;
}

export interface ChevalierOptions {
  /** App root relative to project root. Default: "./app". */
  appRoot?: string;
  /** SSR server entry. Default: "/app/server.ts". */
  entry?: string;
  /** Virtual module id exposing the island id → dev-URL map. */
  islandsModuleId?: string;
}

const DEFAULTS = {
  appRoot: "./app",
  entry: "/app/server.ts",
  islandsModuleId: "virtual:chevalier-islands",
};

/** App-root-relative path for `file`, or null if it's outside the app root. */
function appRel(file: string, appRoot: string): string | null {
  const p = normalizePath(file).replace(/[?#].*$/, ""); // Vite query suffix
  const root = normalizePath(appRoot).replace(/^\.?\//, "");
  if (p.includes(`/${root}/`)) {
    return p.slice(p.indexOf(`/${root}/`) + root.length + 2);
  }
  if (p.startsWith(root + "/")) return p.slice(root.length + 1);
  return null;
}

// "route" reloads only matching browsers; "layout" broadcasts because a _layout
// wraps many routes and can't be cheaply mapped back to one URL.
type ReloadKind = "route" | "layout" | null;

function reloadKind(
  file: string,
  appRoot: string,
): { kind: ReloadKind; rel: string | null } {
  const rel = appRel(file, appRoot);
  if (rel === null || isIsland(rel)) return { kind: null, rel };
  if (rel.includes("_layout")) return { kind: "layout", rel };
  if (rel.startsWith("routes/")) return { kind: "route", rel };
  return { kind: null, rel };
}

// Minimal structural view of Vite's SSR EnvironmentModuleGraph — avoids
// depending on the concrete type across Deno's split node_modules trees.
type SsrModule = { importers: Iterable<SsrModule> };
interface SsrModuleGraph {
  getModuleById(id: string): SsrModule | undefined;
  getModulesByFile(file: string): Set<SsrModule> | undefined;
  invalidateModule(mod: SsrModule): void;
  onFileDelete(file: string): void;
}

// Re-transform an island's SSR module and every SSR module that imports it, so a
// changed/removed nested-island import doesn't linger in the importer's graph.
function invalidateSsrImporters(ssr: SsrModuleGraph, file: string): void {
  for (const mod of ssr.getModulesByFile(file) ?? []) {
    for (const importer of mod.importers) ssr.invalidateModule(importer);
    ssr.invalidateModule(mod);
  }
}

function scopedPrefresh(appRoot: string, isServe: () => boolean): Plugin {
  return {
    name: "chevalier:prefresh",
    async transform(
      this: unknown,
      code: string,
      id: string,
      txOpts?: { ssr?: boolean },
    ) {
      // Prefresh's HMR hooks only exist in the dev runtime; running it during
      // `vite build` would corrupt island chunks (now their own build inputs).
      if (!isServe() || txOpts?.ssr) return;
      const rel = appRel(id, appRoot);
      if (rel === null || !isIsland(rel)) return;
      return (await loadPrefreshTransform())?.call(this, code, id, txOpts);
    },
  } as Plugin;
}

export function chevalier(options: ChevalierOptions = {}): Plugin[] {
  const opts = { ...DEFAULTS, ...options };
  const virtualId = opts.islandsModuleId;
  const resolvedVirtualId = "\0" + virtualId;
  // Virtual ids resolve to themselves (no \0), so their dev URLs stay readable:
  // /@id/chevalier:client and /@id/chevalier-island:<id>. The \0 convention
  // would surface as __x00__ in those URLs.
  const clientVirtualId = "chevalier:client";
  // Registry must be ONE instance so the island wrapper sees the collector
  // server.ts sets (see src/registry.tsx); a bare specifier splits it in two.
  const registryVirtualId = "chevalier:registry";
  const registryUrl = import.meta.resolve("./registry.tsx");
  // Prefix marking a per-island virtual alias → its real source file on disk.
  const islandPrefix = "chevalier-island:";
  const appRootRel = opts.appRoot.replace(/^\.?\//, "");
  let serve = true; // gates prefresh to dev; set from config().env.command
  let projectRoot = ""; // resolved config.root; used to locate islands on disk
  // HMR client → its last-reported location.pathname (for route-scoped reloads).
  const clientPaths = new WeakMap<object, string>();

  const main: Plugin = {
    name: "chevalier",

    config(config, env) {
      serve = env.command === "serve";
      // Client build only: add each island as a Rollup input so it lands in the
      // manifest, where server.ts resolves it via resolveIslandUrl.
      if (env.command === "build" && !env.isSsrBuild) {
        const root = config.root ?? Deno.cwd();
        const islands = discoverIslands(`${root}/${appRootRel}`, appRootRel);
        const existing = config.build?.rollupOptions?.input;
        // Normalize the user's input (string | string[] | Record) into a keyed object.
        const input: Record<string, string> = {};
        if (typeof existing === "string") input["client"] = existing;
        else if (Array.isArray(existing)) {
          for (const e of existing) input[inputKey(e)] = e;
        } else if (existing) Object.assign(input, existing);
        Object.assign(input, islands);
        // The chevalier client entry — keyed by CLIENT_NAME so the chunk's
        // manifest `name` is stable for resolveClientEntry.
        input[CLIENT_NAME] = clientVirtualId;
        config.build ??= {};
        config.build.rollupOptions ??= {};
        config.build.rollupOptions.input = input;
        // Default preserveEntrySignatures:false drops the client entry's
        // `hydrateIslands` export, which the per-page boot script needs by name.
        config.build.rollupOptions.preserveEntrySignatures = "allow-extension";
      }

      return {
        // custom (not spa): stop Vite's html/spa fallback from rewriting page
        // URLs to /index.html before our SSR middleware sees them.
        appType: "custom",
        // Hydration parity with preact-render-to-string SSR output.
        esbuild: { jsx: "automatic", jsxImportSource: "preact" },
        resolve: {
          alias: { "react": "preact/compat", "react-dom": "preact/compat" },
        },
      };
    },

    configResolved(config) {
      projectRoot = config.root;
    },

    resolveId(id) {
      if (id === virtualId) return resolvedVirtualId;
      if (id === clientVirtualId) return id; // self-resolve, no \0 (see above)
      // Local checkout resolves to file:// — return the plain path Vite loads
      // directly; published is https://jsr.io/… — hand off to the deno plugin.
      if (id === registryVirtualId) {
        return registryUrl.startsWith("file://")
          ? fileURLToPath(registryUrl)
          : this.resolve(registryUrl);
      }
      // chevalier-island:<id> → the real island source, so Vite serves and HMRs
      // the actual file; the alias only prettifies the dev URL.
      if (id.startsWith(islandPrefix)) {
        // Island-to-island imports (and HMR) can carry the extension and a
        // `?t=` suffix; the island map is keyed extensionless (islandId).
        const raw = id.slice(islandPrefix.length).replace(/\?.*$/, "");
        const islandKey = islandId(raw);
        const root = projectRoot || Deno.cwd();
        const islands = discoverIslands(`${root}/${appRootRel}`, appRootRel);
        const rel = islands[islandKey]; // e.g. "app/islands/counter.tsx"
        if (rel) return `${root}/${rel}`;
        // We own this scheme: a miss must throw here, not fall through to
        // Deno's loader (which only emits an opaque "Unsupported scheme" 500).
        throw new Error(
          `[chevalier] no island "${islandKey}" — was ${appRootRel}/${islandKey}.tsx deleted or renamed? Reload to clear stale imports.`,
        );
      }
    },

    load(id) {
      if (id === clientVirtualId) {
        return `export { hydrateIslands } from "chevalier/client";`;
      }
      if (id !== resolvedVirtualId) return;
      // Island id → dev URL literal. Dev-only; a build resolves urls from the
      // manifest (resolveIslandUrl).
      const root = projectRoot || Deno.cwd();
      const islands = discoverIslands(`${root}/${appRootRel}`, appRootRel);
      const urls: Record<string, string> = {};
      for (const islandKey of Object.keys(islands)) {
        urls[islandKey] = `/@id/${islandPrefix}${islandKey}`;
      }
      return `export const urls = ${JSON.stringify(urls)};`;
    },

    // SSR-only: wrap the island's default export with the hydration marker so
    // user code stays a plain `export default Component`, no island() boilerplate.
    transform(code, id, transformOpts) {
      if (!transformOpts?.ssr) return;
      const rel = appRel(id, opts.appRoot);
      if (rel === null || !isIsland(rel)) return;
      if (!/export\s+default\s+/.test(code)) return;
      const marker = islandId(rel);

      // Bind the default to a const, then re-export it wrapped. `export default
      // function Foo` becomes `const … = function Foo`, a valid named fn expr.
      const rewritten = code.replace(
        /export\s+default\s+/,
        "const __chevalierDefault = ",
      ) +
        `\nexport default __chevalierIsland(__chevalierDefault, ${
          JSON.stringify(marker)
        });`;
      return {
        code:
          `import { island as __chevalierIsland } from ${
            JSON.stringify(registryVirtualId)
          };\n` +
          rewritten,
        map: null,
      };
    },

    configureServer(server) {
      // Watcher add/unlink bypass handleHotUpdate, so handle island
      // add/remove here: the SSR graph would otherwise keep a stale island set.
      const onIslandStructureChange = (file: string) => {
        const rel = appRel(file, opts.appRoot);
        if (rel === null || !isIsland(rel)) return;
        const ssr = server.environments?.ssr?.moduleGraph;
        if (!ssr) return;
        // Forget the file, drop the virtual map (regenerates via load) and the
        // island's importers so they re-transform without the stale import.
        ssr.onFileDelete(file);
        const virtual = ssr.getModuleById(resolvedVirtualId);
        if (virtual) ssr.invalidateModule(virtual);
        invalidateSsrImporters(ssr, file);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("add", onIslandStructureChange);
      server.watcher.on("unlink", onIslandStructureChange);

      // Record each client's reported pathname, keyed by the client object.
      server.ws.on(
        "chevalier:route",
        (data: { pathname?: unknown }, client: object) => {
          if (typeof data?.pathname === "string") {
            clientPaths.set(client, data.pathname);
          }
        },
      );

      // Post hook: our SSR app is the fallthrough, after Vite's own middlewares.
      return () => server.middlewares.use(devMiddleware(server, opts.entry));
    },

    handleHotUpdate({ file, server }: { file: string; server: ViteDevServer }) {
      const { kind, rel } = reloadKind(file, opts.appRoot);
      if (kind === "layout") {
        server.ws.send({ type: "full-reload" });
        return [];
      }
      if (kind === "route") {
        const matches = compileRouteMatcher(rel!);
        // No reported path yet → reload anyway (safe default).
        for (const client of server.ws.clients) {
          const path = clientPaths.get(client);
          if (path === undefined || matches(path)) {
            client.send({ type: "full-reload" });
          }
        }
        return []; // swallow HMR — no partial module swap
      }
      // Island edit: prefresh handles the client, but the SSR module and its
      // SSR importers must re-transform too, else the importer graph goes stale.
      if (rel !== null && isIsland(rel)) {
        const ssr = server.environments?.ssr?.moduleGraph;
        if (ssr) invalidateSsrImporters(ssr, file);
      }
    },
  };

  return [main, scopedPrefresh(opts.appRoot, () => serve)];
}

export default chevalier;
