# TODO

## Nice-to-have

- **Nested layouts.** Only a single root `_layout.tsx` works, via the explicit
  `layout:` option. HonoX resolves `_renderer.tsx` per-directory and nests them.
  Diverges from "HonoX 1:1" — root-layout-only may be intentional.

- **Island HMR silently degrades without prefresh.** Fast Refresh needs the app
  to provide `@prefresh/vite` (+ `@prefresh/core`/`utils`), resolved at runtime
  via `import.meta.resolve`. If absent, `scopedPrefresh` falls back to default
  HMR — islands reload-swap and lose state with no error. Surface a one-time
  warning, or document the required deps in the app template.

- **Async / nested islands.** No island-in-island, no `Suspense`/async islands.
  Fine for v0.

- **Dev middleware is minimal.** The handrolled dev SSR middleware (replacing
  `@hono/vite-dev-server`) in `src/vite.ts` covers the SSR-render path but not
  that plugin's platform adapters (Cloudflare/Bun `env`, `executionContext`) or
  configurable exclude/injection options. Add back only if an app needs them.

- **No lint/CI config.** No `deno lint` task or CI; `deno.lock` is currently
  gitignored (revisit if reproducible installs matter).
