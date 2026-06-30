import { defineConfig } from "vite";
import { chevalier } from "chevalier";

// import.meta.dirname is Deno's Node-free absolute dir of this config file.
const fromHere = (p: string) => `${import.meta.dirname}/${p}`;

// Client/SSR builds must not share an outDir (each empties it).
export default defineConfig(({ isSsrBuild }) => ({
  resolve: {
    // Deno resolves the bare `chevalier` specifier via the import map; Vite/Rollup need an explicit alias.
    alias: {
      // Slim entry: `chevalier` (mod.ts) would drag the Vite plugin into the browser bundle.
      "chevalier/client": fromHere("../../src/client.ts"),
      "chevalier/registry": fromHere("../../src/registry.tsx"),
      "chevalier": fromHere("../../src/mod.ts"),
    },
    // Framework source lives outside this root; dedupe forces one Preact instance (required for hydration).
    dedupe: ["preact", "preact/hooks", "preact-render-to-string", "hono"],
  },
  // Bundle framework source (outside this root) through Vite's resolver instead of Node externalization.
  ssr: {
    noExternal: ["chevalier", "hono", "preact", "preact-render-to-string"],
  },
  // Under Deno the esbuild optimizer skips its .vite/deps cache, causing 404s; deps have clean ESM exports so unbundled works.
  optimizeDeps: { noDiscovery: true, include: [] },
  // chevalier serves the SSR entry in dev itself (its configureServer hook).
  plugins: [chevalier({ appRoot: "./app", entry: "/app/server.ts" })],
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
