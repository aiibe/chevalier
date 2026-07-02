# TODO

## Nice-to-have

- **Migrate to Vite 8.** Vite 8 replaces esbuild with Oxc as the default
  transformer, so the `esbuild: { jsx, jsxImportSource }` in the `config` hook
  (`src/vite.ts`) and the template no longer type-check. Port that JSX config to
  the `oxc` option and re-run full tests + smoke before widening the `^7` pin;
  hydration parity with `preact-render-to-string` depends on getting it right.

- **`init/templates/` is a hand-kept parallel of `examples/basic`.** The
  embed/drift-guard is done (`init/templates/` real files → `templates.gen.ts`
  via `deno task gen`, checked in CI by `gen:check`). But the two trees are
  still maintained by hand — a change to the example must be mirrored into the
  template manually (as the loader/quote examples just were). To fully close the
  gap, generate `templates/` _from_ `examples/basic` with declared transforms
  (local-src imports → `jsr:@chevalier/core`, drop the clock demo) rather than
  keeping a second copy.

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

- **Dev middleware is minimal.** The dev SSR middleware in `src/vite.ts` covers
  the SSR-render path but not platform adapters (Cloudflare/Bun `env`,
  `executionContext`) or configurable exclude/injection options. Add only if an
  app needs them.

- **`deno.lock` is gitignored.** It exists locally but is untracked, so CI
  resolves deps fresh each run (revisit if reproducible installs matter).
