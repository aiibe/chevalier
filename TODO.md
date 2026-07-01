# TODO

## Nice-to-have

- **`@chevalier/init` template drifts from `examples/basic`.** The scaffolder
  embeds its files as string constants in `init/templates.ts`, hand-kept in sync
  with `examples/basic`. If the example's wiring changes (vite config,
  server.ts, layout), the template silently goes stale. Deferred until after the
  first publish — do it next iteration, not before shipping 0.0.2. Direction:
  generate `templates.ts` _from_ `examples/basic` via a prepublish step that
  applies declared transforms (local-src imports → `jsr:@chevalier/core`, drop
  the `$clock` Rule-B demo, strip PLAN§/Rule-A comments, retitle), then verifies
  the committed file is up to date. The files aren't copy-identical, so a plain
  copy would ship broken `../../src` paths — the transforms are the work.

- **Publish `@chevalier/core@0.0.2`.** The scaffold pins `^0.0.2` (for the
  `./client` + `./registry` sub-path exports added to `deno.json`), but only
  `0.0.1` is on JSR and it lacks those exports. Until 0.0.2 is published a fresh
  scaffold fails with "Unknown export './client'". The `smoke-published` CI job
  (`SMOKE_JSR=1`, `workflow_dispatch`) verifies the published package once it's
  up — run it after publishing.

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

- **Async / nested islands.** No island-in-island, no `Suspense`/async islands.
  Fine for v0.

- **Dev middleware is minimal.** The handrolled dev SSR middleware (replacing
  `@hono/vite-dev-server`) in `src/vite.ts` covers the SSR-render path but not
  that plugin's platform adapters (Cloudflare/Bun `env`, `executionContext`) or
  configurable exclude/injection options. Add back only if an app needs them.

- **`deno.lock` is gitignored.** No committed lockfile, so CI resolves deps
  fresh each run (revisit if reproducible installs matter).
