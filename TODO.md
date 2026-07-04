# TODO

## High

- **No middleware convention (auth bites first).** A route folder can't declare
  scoped middleware; auth/logging today means a hand-rolled Hono `app.use` in a
  handler file or in the SSR entry — it works but isn't a paved path, so every
  app reinvents it. Add a `_middleware.ts` convention (per-directory, composed
  outer-to-inner like the router mounts) that runs before the page/handler
  dispatch, so login guards are declarative. The `getSession` helper is in place
  for such a guard to read.

- **Only one root layout.** `_layout.tsx` is global; there's no per-directory
  layout, so a public site + admin area must branch chrome inside the single
  file. Support nested `_layout.tsx` at any `app/routes/**` level, composed
  inner-to-outer, wrapping only the routes beneath it.

## Nice-to-have

- **`init/templates/` is a hand-kept parallel of `examples/basic`.** The
  embed/drift-guard is done (`init/templates/` real files → `templates.gen.ts`
  via `deno task gen`, checked in CI by `gen:check`). But the two trees are
  still maintained by hand — a change to the example must be mirrored into the
  template manually (as the loader/quote examples just were). To fully close the
  gap, generate `templates/` _from_ `examples/basic` with declared transforms
  (local-src imports → `jsr:@chevalier/core`, drop the clock demo) rather than
  keeping a second copy.

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
