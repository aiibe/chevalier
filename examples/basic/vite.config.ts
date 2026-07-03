import { defineConfig } from "vite";
import { chevalierConfig } from "chevalier/vite";

const fromHere = (p: string) => `${import.meta.dirname}/${p}`;

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
