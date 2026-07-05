# TODO

## High

- **No docs site.** `CHANGELOG.md` now carries the stability policy and the
  0.0.x → 0.1/1.0 path, and the README points at both. Still missing: an actual
  docs site. Plan is to dogfood — build it _as_ a Chevalier app (under `docs/`
  or `examples/`) so the site doubles as proof the framework ships real content.

## Nice-to-have

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
