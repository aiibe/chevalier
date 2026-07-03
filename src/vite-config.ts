// Full Vite config for a chevalier app; the template is defineConfig(chevalierConfig()).

import type { PluginOption, UserConfig } from "vite";
import deno from "@deno/vite-plugin";
import { chevalier, type ChevalierOptions } from "./vite.ts";

type ConfigFn = (env: { isSsrBuild?: boolean }) => UserConfig;

/** Pass appRoot only to move the app dir; the SSR app is generated. */
export function chevalierConfig(
  options: ChevalierOptions = {},
): ConfigFn {
  return ({ isSsrBuild }) => ({
    resolve: {
      // One Preact instance across SSR + islands is required for hydration.
      dedupe: ["preact", "preact/hooks", "preact-render-to-string", "hono"],
      // JSR bakes core's import map into source (npm:pkg@x, npm:/pkg@x/sub); map
      // back to bare names or the SSR bundle can't resolve them.
      alias: [
        { find: /^npm:preact@[^/]*\/(.*)$/, replacement: "preact/$1" },
        { find: /^npm:preact@[^/]*$/, replacement: "preact" },
        { find: /^npm:\/hono@[^/]*\/(.*)$/, replacement: "hono/$1" },
        { find: /^npm:hono@[^/]*$/, replacement: "hono" },
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
