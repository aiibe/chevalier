# TODO

## Nice-to-have

- **Verify the Vite 8 migration end-to-end before release.** Migration is done
  and pinned to `^8` (client + SSR build, built-server runtime, dev server, and
  57 core tests all green on `vite@8.1.3`). The SSR-build breakage is fixed as
  part of it: `src/mod.ts` was one barrel mixing runtime exports with the
  build-time plugin (`chevalier`/`chevalierConfig` → `@deno/vite-plugin` →
  `rs_lib.wasm`), so `app/server.ts` dragged the plugin's wasm into the runtime
  bundle; split out a `chevalier/vite` export to sever it. Still to do: run the
  headless-Chrome hydration smoke (`deno task check:hydration`) against the built
  example, and confirm the `_error.tsx` INEFFECTIVE_DYNAMIC_IMPORT build warning
  is benign (it predates this — `app/server.ts` both static- and glob-imports the
  error page).

- **`chevalier-islands.d.ts` is a copied shim for a core virtual module.** The
  4-line `declare module "virtual:chevalier-islands"` is identical in every app
  and really belongs to core (it owns the virtual module). Ship it as an ambient
  type from core so apps reference it instead of copying the declaration.

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
