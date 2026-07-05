# TODO

## Release notes (next version)

- **Breaking: layout model split into `_app.tsx` + nesting `_layout.tsx`.** The
  document shell (`<html>/<head>/<body>` + `<Head>`) now lives in a single
  app-root `_app.tsx`; `_layout.tsx` files are body-only and _nest_ (compose
  outer→inner) rather than the old nearest-wins-replaces model. `resolveLayout`
  → `resolveLayouts`; new `App`/`Head` exports (the shell `<Head>`), and the
  page-side head component is renamed `Head` → `PageHead`. Apps upgrading must
  add an `_app.tsx`, strip `<html>`/`<head>` from their layouts, and rename any
  page `<Head>` to `<PageHead>`.

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
