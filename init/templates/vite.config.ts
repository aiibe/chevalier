import { defineConfig } from "vite";

// Dynamic import: a static `import "chevalier/vite"` (import-map specifier)
// makes Vite's config bundler print a spurious UNRESOLVED_IMPORT.
const { chevalierConfig } = await import(import.meta.resolve("chevalier/vite"));

// Pass { appRoot } to move the app dir from ./app; the SSR app is generated.
export default defineConfig(chevalierConfig());
