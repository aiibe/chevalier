import { defineConfig } from "vite";
import deno from "@deno/vite-plugin";
import { chevalier } from "chevalier";

// import.meta.dirname is Deno's Node-free absolute dir of this config file.
const fromHere = (p: string) => `${import.meta.dirname}/${p}`;

// Mirrors the scaffolder's config (init/templates.ts), but points `chevalier` at
// local ../../src instead of the jsr: pin — this example dogfoods the checkout.
// @deno/vite-plugin resolves jsr:/npm: specifiers via Deno's loader; its hooks
// only engage on Vite 7 (Environment API). Client/SSR need separate outDirs.
export default defineConfig(({ isSsrBuild }) => ({
  resolve: {
    // Local src, not the import map's bare specifier; Vite/Rollup need real paths.
    // Slim entry: `chevalier` (mod.ts) would drag the Vite plugin into the browser bundle.
    alias: [
      { find: "chevalier/client", replacement: fromHere("../../src/client.ts") },
      { find: "chevalier/registry", replacement: fromHere("../../src/registry.tsx") },
      { find: "chevalier", replacement: fromHere("../../src/mod.ts") },
      // Map baked npm:preact@x[/sub] specifiers back to the import-map name so the
      // jsx-runtime subpath (jsxs/jsxDEV) resolves instead of collapsing to bare preact.
      { find: /^npm:preact@[^/]*\/(.*)$/, replacement: "preact/$1" },
      { find: /^npm:preact@[^/]*$/, replacement: "preact" },
    ],
    // dedupe forces one Preact instance across SSR + islands (required for hydration).
    dedupe: ["preact", "preact/hooks", "preact-render-to-string", "hono"],
  },
  // Must process preact in-pipeline: externalized, its jsx-runtime subpath
  // (jsxs/jsxDEV) collapses to bare preact, which lacks those exports.
  ssr: { noExternal: true },
  // Under Deno the esbuild optimizer skips its .vite/deps cache, causing 404s; deps have clean ESM exports so unbundled works.
  optimizeDeps: { noDiscovery: true, include: [] },
  // chevalier before deno so it claims virtual:chevalier-islands before the
  // deno loader rejects the virtual: scheme. chevalier also serves the SSR entry
  // in dev itself (its configureServer hook).
  plugins: [chevalier({ appRoot: "./app", entry: "/app/server.ts" }), deno()],
  build: isSsrBuild
    ? {
      // SSR entry passed on the CLI; `build.ssr` in config wasn't applied as the rollup input here.
      outDir: "dist/server",
    }
    : {
      // Client entry + island inputs are injected by the chevalier plugin.
      outDir: "dist/client",
      manifest: true, // → dist/client/.vite/manifest.json
    },
}));
