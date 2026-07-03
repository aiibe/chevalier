import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";

// Dynamic import: a static `import "chevalier/vite"` (import-map specifier)
// makes Vite's config bundler print a spurious UNRESOLVED_IMPORT.
const { chevalierConfig } = await import(import.meta.resolve("chevalier/vite"));

const fromHere = (p: string) => `${import.meta.dirname}/${p}`;

// Registers app/styles.css as a client input so Tailwind emits a hashed,
// manifest-listed asset (_layout.tsx resolves it via styleUrl). Its own config
// hook so Vite deep-merges the input alongside chevalier's island inputs.
const stylesInput: Plugin = {
  name: "chevalier-styles-input",
  config(_config, env) {
    if (env.command === "build" && !env.isSsrBuild) {
      return {
        build: { rollupOptions: { input: { styles: "/app/styles.css" } } },
      };
    }
  },
};

// Same chevalierConfig() the template uses, but aliasing `chevalier` to local
// ../../src (not the jsr: pin) so the example dogfoods the checkout. Slim
// client/registry entries keep the Vite plugin out of the browser bundle.
export default defineConfig((env) => {
  const base = chevalierConfig()(env);
  const baseAlias = base.resolve?.alias as Array<
    { find: string | RegExp; replacement: string }
  >;
  return {
    ...base,
    plugins: [...(base.plugins ?? []), tailwindcss(), stylesInput],
    resolve: {
      ...base.resolve,
      alias: [
        {
          find: "chevalier/client",
          replacement: fromHere("../../src/client.ts"),
        },
        {
          find: "chevalier/registry",
          replacement: fromHere("../../src/registry.tsx"),
        },
        {
          find: "chevalier/vite",
          replacement: fromHere("../../src/vite-config.ts"),
        },
        { find: "chevalier", replacement: fromHere("../../src/mod.ts") },
        ...baseAlias,
      ],
    },
  };
});
