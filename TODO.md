# TODO

## High

- **`app/server.ts` is ~45 lines of copy-identical wiring.** Every scaffolded
  app carries the same PROD-guarded manifest glob/extract, the `secureHeaders` +
  `NONCE` CSP block, and the `resolveIslandUrls` call — none app-specific, all
  easy to copy-break and impossible for an app author to debug. Add a core
  `defineApp()` that takes just the glob results + convention modules and does
  the manifest extraction, CSP, and island-URL resolution internally. The globs
  must stay at the call site (Vite rewrites `import.meta.glob` there), but
  everything else moves to core. Slims the template + example server to a few
  lines.

- **Nonce-CSP coupling is invisible across the app/core boundary.** The app
  opts into the nonce CSP by hand in `server.ts`, and it must match the
  `secureHeadersNonce` key `createApp` reads (`src/server.ts` `readNonce`) — a
  silent contract with no type link. Fold the CSP setup into `defineApp` above
  (default on, escape hatch for a custom policy) so core owns both ends.

## Nice-to-have

- **`vite.config.ts` is ~35 lines of mechanical workarounds.** Preact dedupe,
  the `npm:preact@x` alias regex, `ssr.noExternal`, `optimizeDeps`, plugin
  ordering + the `PluginOption[]` cast, and dual `outDir`s are all things core
  understands and the app shouldn't. Add a `chevalierConfig({ appRoot, entry })`
  helper returning the config object; the template config collapses to one call.

- **`chevalier-islands.d.ts` is a copied shim for a core virtual module.** The
  4-line `declare module "virtual:chevalier-islands"` is identical in every app
  and really belongs to core (it owns the virtual module). Ship it as an ambient
  type from core so apps reference it instead of copying the declaration.

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

- **Island HMR silently degrades without prefresh.** Fast Refresh needs the app
  to provide `@prefresh/vite` (+ `@prefresh/core`/`utils`), resolved at runtime
  via `import.meta.resolve`. If absent, `scopedPrefresh` falls back to default
  HMR — islands reload-swap and lose state with no error. Surface a one-time
  warning, or document the required deps in the app template.

- **No Deno Deploy build preset.** Chevalier requires a manual `deno task build`
  before deploy since Deploy doesn't run Vite. Automating the build-then-deploy
  step would close the gap; today the template README's Deploy section documents
  the manual flow.
