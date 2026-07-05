# TODO

## High

- **Sessions never expire.** `getSession` sets no `maxAge` and the payload
  embeds no timestamp, so a captured cookie verifies forever. Embed an `exp`
  checked on read (or default a `maxAge`); consider `secret: string | string[]`
  for rotation.

- **Island props serialization fails silently.** Bare `JSON.stringify` in
  `collectProps`/`buildBoot` mangles `Date`, drops `undefined`/functions, and
  empties `Map`/`Set` with no warning — the symptom is a subtly wrong island
  after hydration. Warn or throw when a prop won't round-trip.

- **No request-body limit on actions.** `c.req.formData()` buffers the whole
  body, so a large POST is a trivial memory-exhaustion vector. Apply Hono's
  `bodyLimit` around actions with a sane default.

- **No docs site.** The README ends at "full docs are on the way"; docs are part
  of production readiness. Ship them, plus a stated stability policy and a path
  from 0.0.x toward 0.1/1.0 with a changelog.

## Nice-to-have

- **No observability guidance.** Logging is deliberately bring-your-own Hono
  middleware, but the docs should show the root `_middleware.ts` logger pattern
  and a health-check handler example.

- **No app testing story.** An app author can't test a loader/action or render a
  route without booting Vite. A tiny helper that builds the Hono app from globs
  and hands back `fetch` would cover it.

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
