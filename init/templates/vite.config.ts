import { defineConfig } from "vite";
import { chevalierConfig } from "chevalier";

// Pass { appRoot, entry } to override the ./app + /app/server.ts defaults.
export default defineConfig(chevalierConfig());
