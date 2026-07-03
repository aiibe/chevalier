import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";

// Dynamic import: a static `import "chevalier/vite"` (import-map specifier)
// makes Vite's config bundler print a spurious UNRESOLVED_IMPORT.
const { chevalierConfig } = await import(import.meta.resolve("chevalier/vite"));

// Registers app/styles.css as a client input so Tailwind emits it as a hashed,
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

// Pass { appRoot } to move the app dir from ./app; the SSR app is generated.
const base = chevalierConfig();
export default defineConfig((env) => {
  const config = base(env);
  return {
    ...config,
    plugins: [...(config.plugins ?? []), tailwindcss(), stylesInput],
  };
});
