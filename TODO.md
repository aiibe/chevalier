# TODO

## Nice-to-have

- **Migrate to Vite 8.** Vite 8 replaces esbuild with Oxc as the default
  transformer, so the `esbuild: { jsx, jsxImportSource }` in the `config` hook
  (`src/vite.ts`) and the template no longer type-check. Port that JSX config to
  the `oxc` option and re-run full tests + smoke before widening the `^7` pin;
  hydration parity with `preact-render-to-string` depends on getting it right.

- **`@chevalier/init` template drifts from `examples/basic`.** The scaffolder
  hand-keeps its files as string constants in `init/templates.ts`, so the
  template silently goes stale when the example's wiring changes. Direction:
  generate `templates.ts` _from_ `examples/basic` via a prepublish step that
  applies declared transforms (local-src imports → `jsr:@chevalier/core`, drop
  the `$clock` demo, strip PLAN§ comments) and verifies the committed file is up
  to date — a plain copy would ship broken `../../src` paths, so the transforms
  are the work.

- **Hydration check not in CI.** `examples/basic` has a headless-Chrome
  hydration smoke test (`deno task check:hydration`) that's macOS-Chrome-path
  specific and not wired into the `ci.yml` workflow. Add a Chrome setup step and
  run it (or the equivalent) against the built example on CI.

- **Nested layouts.** Only a single root `_layout.tsx` works, via the explicit
  `layout:` option. HonoX resolves `_renderer.tsx` per-directory and nests them.
  Diverges from "HonoX 1:1" — root-layout-only may be intentional.

- **Island HMR silently degrades without prefresh.** Fast Refresh needs the app
  to provide `@prefresh/vite` (+ `@prefresh/core`/`utils`), resolved at runtime
  via `import.meta.resolve`. If absent, `scopedPrefresh` falls back to default
  HMR — islands reload-swap and lose state with no error. Surface a one-time
  warning, or document the required deps in the app template.

- **Async islands.** No `Suspense`/async islands yet. Nested islands
  (island-in-island) now work; async is fine to defer for v0.

- **Dev middleware is minimal.** The handrolled dev SSR middleware (replacing
  `@hono/vite-dev-server`) in `src/vite.ts` covers the SSR-render path but not
  that plugin's platform adapters (Cloudflare/Bun `env`, `executionContext`) or
  configurable exclude/injection options. Add back only if an app needs them.

- **`deno.lock` is gitignored.** No committed lockfile, so CI resolves deps
  fresh each run (revisit if reproducible installs matter).
