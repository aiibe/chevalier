// Full Vite config for a chevalier app; the template is defineConfig(chevalierConfig()).

import type { PluginOption, UserConfig } from "vite";
import deno from "@deno/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { chevalier, type ChevalierOptions } from "./vite.ts";
import { islandPrefresh } from "./vite/prefresh.ts";

type ConfigFn = (env: { isSsrBuild?: boolean }) => Promise<UserConfig>;

/** Pass appRoot only to move the app dir; the SSR app is generated. */
export function chevalierConfig(
  options: ChevalierOptions = {},
): ConfigFn {
  return async ({ isSsrBuild }) => ({
    resolve: {
      // One Preact instance across SSR + islands is required for hydration.
      dedupe: ["preact", "preact/hooks", "preact-render-to-string", "hono"],
      // JSR bakes core's import map into source (npm:pkg@x, npm:/pkg@x/sub); map
      // back to bare names or the SSR bundle can't resolve them.
      alias: [
        { find: /^npm:\/preact@[^/]*\/(.*)$/, replacement: "preact/$1" },
        { find: /^npm:preact@[^/]*\/(.*)$/, replacement: "preact/$1" },
        { find: /^npm:preact@[^/]*$/, replacement: "preact" },
        { find: /^npm:\/hono@[^/]*\/(.*)$/, replacement: "hono/$1" },
        { find: /^npm:hono@[^/]*$/, replacement: "hono" },
      ],
    },
    // Externalized, preact's jsx-runtime subpath collapses to bare preact, which
    // lacks jsxs/jsxDEV; process it in-pipeline instead.
    ssr: { noExternal: true },
    // prefresh force-optimizes @prefresh/core with its OWN bundled preact; optimize
    // preact here too so both share one instance, else fast-refresh won't re-render.
    optimizeDeps: {
      noDiscovery: true,
      include: ["preact", "preact/hooks", "preact/jsx-runtime"],
    },
    // chevalier before deno so it claims virtual:chevalier-* before the deno
    // loader rejects the virtual: scheme. islandPrefresh: island fast-refresh.
    // Cast: separate node_modules trees.
    plugins: [
      chevalier(options),
      ...await islandPrefresh(),
      tailwindcss(),
      deno(),
    ] as PluginOption[],
    build: isSsrBuild
      ? { outDir: "dist/server" }
      : { outDir: "dist/client", manifest: true },
  });
}
