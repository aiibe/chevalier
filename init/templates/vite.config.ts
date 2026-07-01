import { defineConfig, type PluginOption } from "vite";
import deno from "@deno/vite-plugin";
import { chevalier } from "chevalier";

// @deno/vite-plugin resolves jsr:/npm: specifiers via Deno's loader; its hooks
// only engage on Vite 7 (Environment API). Client/SSR need separate outDirs.
export default defineConfig(({ isSsrBuild }) => ({
  // One Preact instance across SSR + islands is required for hydration.
  resolve: {
    dedupe: ["preact", "preact/hooks", "preact-render-to-string", "hono"],
    // Published core bakes in npm:preact@x/jsx-runtime specifiers; map them back
    // to the import-map name so the jsx-runtime subpath (jsxs/jsxDEV) resolves.
    alias: [
      { find: /^npm:preact@[^/]*\/(.*)$/, replacement: "preact/$1" },
      { find: /^npm:preact@[^/]*$/, replacement: "preact" },
    ],
  },
  // Must process preact in-pipeline: externalized, its jsx-runtime subpath
  // (jsxs/jsxDEV) collapses to bare preact, which lacks those exports.
  ssr: { noExternal: true },
  optimizeDeps: { noDiscovery: true, include: [] },
  // chevalier before deno so it claims virtual:chevalier-islands before the
  // deno loader rejects the virtual: scheme. Cast: the two plugins resolve
  // Vite's Plugin type through separate node_modules trees under Deno.
  plugins: [
    chevalier({ appRoot: "./app", entry: "/app/server.ts" }),
    deno(),
  ] as PluginOption[],
  build: isSsrBuild ? { outDir: "dist/server" } : {
    // Client entry + island inputs are injected by the chevalier plugin.
    outDir: "dist/client",
    manifest: true,
  },
}));
