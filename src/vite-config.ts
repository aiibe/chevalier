// Full Vite config for a chevalier app; the template is defineConfig(chevalierConfig()).

import type { PluginOption, UserConfig } from "vite";
import deno from "@deno/vite-plugin";
import { chevalier, type ChevalierOptions } from "./vite.ts";

type ConfigFn = (env: { isSsrBuild?: boolean }) => UserConfig;

/** Pass appRoot/entry only to override the ./app + /app/server.ts defaults. */
export function chevalierConfig(
  options: Pick<ChevalierOptions, "appRoot" | "entry"> = {},
): ConfigFn {
  return ({ isSsrBuild }) => ({
    resolve: {
      // One Preact instance across SSR + islands is required for hydration.
      dedupe: ["preact", "preact/hooks", "preact-render-to-string", "hono"],
      // Map baked npm:preact@x[/sub] specifiers back to the import-map name so
      // the jsx-runtime subpath resolves instead of collapsing to bare preact.
      alias: [
        { find: /^npm:preact@[^/]*\/(.*)$/, replacement: "preact/$1" },
        { find: /^npm:preact@[^/]*$/, replacement: "preact" },
      ],
    },
    // Externalized, preact's jsx-runtime subpath collapses to bare preact, which
    // lacks jsxs/jsxDEV; process it in-pipeline instead.
    ssr: { noExternal: true },
    // Under Deno the esbuild optimizer skips its .vite/deps cache (404s).
    optimizeDeps: { noDiscovery: true, include: [] },
    // chevalier before deno so it claims virtual:chevalier-* before the deno
    // loader rejects the virtual: scheme. Cast: separate node_modules trees.
    plugins: [chevalier(options), deno()] as PluginOption[],
    build: isSsrBuild
      ? { outDir: "dist/server" }
      : { outDir: "dist/client", manifest: true },
  });
}
