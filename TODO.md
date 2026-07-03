# TODO

## High

- **No middleware convention (auth bites first).** A route folder can't declare
  scoped middleware; auth/logging today means a hand-rolled Hono `app.use` in a
  handler file or in the SSR entry — it works but isn't a paved path, so every
  app reinvents it. Add a `_middleware.ts` convention (per-directory, composed
  outer-to-inner like the router mounts) that runs before the page/handler
  dispatch, so login guards are declarative.

- **Only one root layout.** `_layout.tsx` is global; there's no per-directory
  layout, so a public site + admin area must branch chrome inside the single
  file. Support nested `_layout.tsx` at any `app/routes/**` level, composed
  inner-to-outer, wrapping only the routes beneath it.

- **No cookie/session helper.** With no session primitive, the `_middleware.ts`
  auth guard has nothing to read — every app hand-rolls signed cookies. Add a
  thin `getSession(c)` over Hono's cookie helpers (signed-cookie read/write), so
  a middleware can gate on it. Keep it a wrapper only — no session store, no
  driver abstraction.

## Nice-to-have

- **Form POST has no paved path.** Pages are GET-only, so a real mutating form
  (login, create-post) must route through a separate `export const app` handler
  that redirects back — the `greet` example sidesteps this by GETting the query.
  Not a code gap but a missing documented pattern: add one canonical POST-form →
  handler → redirect example + a README section, so users aren't
  reverse-engineering the GET-only rule.

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

## Non-goals

The framework stays lean and small; these are deliberately out of scope, not a
backlog. Reject them by default.

- **Streaming / async SSR.** Sync `renderToString` with the loader awaited
  before render is a feature — it keeps the render path simple and predictable.
- **Partials / region-swap.** Full-page or full-island only; no over-the-wire
  region updates.
- **Plugin system, RPC type inference, renderer swapping.** HonoX/Fresh surface
  these; each is a whole subsystem that fights the lean goal.
- **Built-in data layer / ORM.** The loader calls whatever the app wants; no
  blessed database integration.
- **Config knobs for their own sake.** Apps follow default conventions; options
  nobody asked for get rejected.
