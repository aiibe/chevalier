# TODO

## Critical

- **SSR build (`vite build --ssr`) is broken by `@deno/vite-plugin@2.0.2`.** Its
  `@jsr/deno__loader` does an ESM `import` of `rs_lib.wasm` that enters the SSR
  graph under `ssr.noExternal: true`, and Vite's default pipeline can't bundle a
  `.wasm` (client build is fine; not caused by `chevalierConfig` — repros on the
  old inline config). Fix by adding `vite-plugin-wasm` to the SSR build, or fold
  into the Vite 8 migration; externalizing the loader is rejected (bakes an
  absolute `node_modules` path → breaks on Deno Deploy).

## Nice-to-have

- **`chevalier-islands.d.ts` is a copied shim for a core virtual module.** The
  4-line `declare module "virtual:chevalier-islands"` is identical in every app
  and really belongs to core (it owns the virtual module). Ship it as an ambient
  type from core so apps reference it instead of copying the declaration.

- **Migrate to Vite 8.** Vite 8 swaps esbuild for Oxc, which ignores Deno's
  `jsxImportSource: preact` and breaks config-load (`react/jsx-runtime` error)
  before the build even starts — spiked and confirmed. Port the preact JSX
  source to Oxc on both surfaces (the plugin's `config` hook at `src/vite.ts:96`
  and the config-file bundling), then re-run tests + hydration smoke before
  widening the `^7` pin. Unconfirmed whether it also fixes the wasm SSR failure
  above; assume not until proven.

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

- **Island HMR silently degrades without prefresh.** Fast Refresh needs the app
  to provide `@prefresh/vite` (+ `@prefresh/core`/`utils`), resolved at runtime
  via `import.meta.resolve`. If absent, `scopedPrefresh` falls back to default
  HMR — islands reload-swap and lose state with no error. Surface a one-time
  warning, or document the required deps in the app template.

- **No Deno Deploy build preset.** Chevalier requires a manual `deno task build`
  before deploy since Deploy doesn't run Vite. Automating the build-then-deploy
  step would close the gap; today the template README's Deploy section documents
  the manual flow.
