// Vite plugin: dev SSR middleware, client/island build inputs, island HMR.
// Routes/_layout full-reload (server-owned SSR); islands HMR via prefresh.
// Internals split under src/vite/: middleware, island discovery, prefresh, reload.

import type { Plugin, ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";
import { isIsland, islandId } from "./islands.ts";
import { compileRouteMatcher } from "./router.ts";
import { CLIENT_NAME, MANIFEST_PATH } from "./manifest.ts";
import { devMiddleware } from "./vite/middleware.ts";
import { discoverIslands, inputKey } from "./vite/islands-discovery.ts";
import { scopedPrefresh } from "./vite/prefresh.ts";
import { appRel, invalidateSsrImporters, reloadKind } from "./vite/reload.ts";

export interface ChevalierOptions {
  /** App root relative to project root. Default: "./app". */
  appRoot?: string;
  /** SSR server entry. Default: "/app/server.ts". */
  entry?: string;
  /** Virtual module id exposing the island id → dev-URL map. */
  islandsModuleId?: string;
  /** Virtual module id exposing the parsed build manifest (undefined in dev). */
  manifestModuleId?: string;
}

const DEFAULTS = {
  appRoot: "./app",
  entry: "/app/server.ts",
  islandsModuleId: "virtual:chevalier-islands",
  manifestModuleId: "virtual:chevalier-manifest",
};

export function chevalier(options: ChevalierOptions = {}): Plugin[] {
  const opts = { ...DEFAULTS, ...options };
  const virtualId = opts.islandsModuleId;
  const resolvedVirtualId = "\0" + virtualId;
  const manifestId = opts.manifestModuleId;
  const resolvedManifestId = "\0" + manifestId;
  // Virtual ids resolve to themselves (no \0), so their dev URLs stay readable:
  // /@id/chevalier:client and /@id/chevalier-island:<id>. The \0 convention
  // would surface as __x00__ in those URLs.
  const clientVirtualId = "chevalier:client";
  // Registry must be ONE instance so the island wrapper sees the collector
  // server.ts sets (see src/registry.tsx); a bare specifier splits it in two.
  const registryVirtualId = "chevalier:registry";
  // new URL, not import.meta.resolve: Vite's SSR module runner rewrites resolve()
  // to a vite-module-runner: scheme the deno loader rejects; import.meta.url stays file://.
  const registryUrl = new URL("./registry.tsx", import.meta.url).href;
  // Prefix marking a per-island virtual alias → its real source file on disk.
  const islandPrefix = "chevalier-island:";
  const appRootRel = opts.appRoot.replace(/^\.?\//, "");
  let serve = true; // gates prefresh to dev; set from config().env.command
  let isSsrBuild = false; // set from config().env; gates manifest inlining
  let projectRoot = ""; // resolved config.root; used to locate islands on disk
  // HMR client → its last-reported location.pathname (for route-scoped reloads).
  const clientPaths = new WeakMap<object, string>();
  // Re-scan on each call: a dev island add/remove must reflect immediately.
  // `config` runs before configResolved sets projectRoot, so it passes root in.
  const islandMap = (root = projectRoot || Deno.cwd()) =>
    discoverIslands(`${root}/${appRootRel}`, appRootRel);

  const main: Plugin = {
    name: "chevalier",

    config(config, env) {
      serve = env.command === "serve";
      isSsrBuild = env.isSsrBuild === true;
      // Client build only: add each island as a Rollup input so it lands in the
      // manifest, where server.ts resolves it via resolveIslandUrl.
      if (env.command === "build" && !env.isSsrBuild) {
        const islands = islandMap(config.root ?? Deno.cwd());
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
      if (id === manifestId) return resolvedManifestId;
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
        const rel = islandMap(root)[islandKey]; // e.g. "app/islands/counter.tsx"
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
      if (id === resolvedManifestId) {
        // Inline only in the SSR build; the client build has already written
        // the manifest to disk. Dev + client build resolve to undefined.
        if (!isSsrBuild) return `export const manifest = undefined;`;
        const path = `${projectRoot || Deno.cwd()}/${MANIFEST_PATH}`;
        const json = Deno.readTextFileSync(path);
        return `export const manifest = ${json};`;
      }
      if (id !== resolvedVirtualId) return;
      // Island id → dev URL literal. Dev-only; a build resolves urls from the
      // manifest (resolveIslandUrl).
      const islands = islandMap();
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
