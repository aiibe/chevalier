# Changelog

All notable changes to Chevalier are recorded here — both the published
`@chevalier/core` package and the `@chevalier/init` scaffolder. As of `0.1.0`
the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
within the pre-1.0 rules in [Stability](#stability).

Entries are versioned against `@chevalier/core`. The scaffolder embeds a working
app that uses `@chevalier/core` and releases on its own `init-vX.Y.Z` tag track;
scaffold-facing changes are noted under the release that carried them, prefixed
_Scaffold:_.

## Stability

Chevalier is pre-1.0; the API can change between releases. Pin an exact version
and read the entry before upgrading.

- **`0.0.x` (past).** Conventions and public API still moving; any bump could
  break.
- **`0.1.x` (now).** Conventions stabilized; breaks ship only in a new `0.y`
  with a migration note, patches stay compatible.
- **`1.0` (later).** Full [SemVer](https://semver.org), once the surface has
  held steady across real apps.

The `0.1` line is the public surface: the `deno.json` exports, the `app/`
conventions (routes, `_app`/`_layout`/`_404`/`_error`, `_middleware`), and the
loader/action/session contracts.

## 0.2.1

Every `_layout.tsx` and the `_app` shell now receive a `route` prop — the
current `url`, the matched route `path`, and the page's `data` — so you can
highlight the active nav link without reaching for the raw request. On a 404 or
error render `path` is `undefined`, since no route matched.

_Scaffold (init 0.1.4):_ fixes `deno task check` failing on a freshly created
app, and stops it type-checking the built bundle once you have built. Checking
the production server needs a real build behind it, which the new
`deno task check:prod` does.

## 0.2.0

**Breaking.** `chevalierConfig()` now returns an async config factory. If your
`vite.config.ts` passes `chevalierConfig()` straight to `defineConfig` — the
scaffold default — nothing changes. If you call the factory yourself, `await`
its result: `const base = await chevalierConfig()(env)`. The factory turned
async because island Fast Refresh is now `@prefresh/vite`'s own plugins wired
into the Vite config and scoped to `islands/` through prefresh's include filter,
rather than a hand-rolled transform, and prefresh v3's plugin factory is itself
async. Requires `@prefresh/vite@^3`.

_Scaffold (init 0.1.3):_ new apps pin `@chevalier/core@^0.2.0` and
`@prefresh/vite@^3.0.1`, and add the `chevalier/static` import the production
server needs.

## 0.1.0

The API surface stabilizes. From here, breaking changes ship only in a new `0.y`
release with a migration note; patches stay compatible (see
[Stability](#stability)).

Your page reads its `loader`'s return type without a manual cast — the data is
typed straight through. Test routes, loaders, actions, and middleware without
starting the dev server: `createTestApp` builds the app from your `app/`
directory so you can assert on responses in a plain `deno test`. Pass a
`string[]` as your session secret to rotate the signing key without logging
existing users out, and sessions now sign out after 7 days. An island prop that
can't be serialized now fails at render with a clear error instead of a broken
page in the browser; an oversized action body is rejected; and an error thrown
in a loader, action, or page shows up in your server logs. Tailwind and
stylesheet paths are set in `chevalierConfig` alongside the rest of your app
config. A HEAD request to a page now renders it (body stripped) instead of
404ing or reaching the action, and a trailing-slash URL 308-redirects to its
canonical path instead of 404ing.

_Scaffold:_ the generated app picks up the above: loader data typed through to
pages, Tailwind and styles in `chevalierConfig`, and errors logged server-side.

## 0.0.11

Fixes Preact hooks (`useState` and friends) failing to resolve in an island.

## 0.0.10

**Breaking.** Layouts split three ways: an `_app.tsx` for the outer HTML shell,
nesting `_layout.tsx` components for shared page chrome, and `PageHead` for a
page setting its own `<title>` and `<head>` tags. If you had a single layout,
move the shell markup into `_app.tsx` and per-page `<head>` content into
`PageHead`. Also fixes a page that could break when an island's import path
contained `</script>`.

_Scaffold:_ the generated app shows the new layout model — an `_app.tsx` shell,
a nesting `_layout.tsx`, and a page setting its own `<head>` with `PageHead`.

## 0.0.9

Drop a `_layout.tsx` or `_middleware.ts` into any routes subdirectory and it
applies to that directory's routes — layouts nest, with the nearest one to the
page winning. Read and write signed-cookie sessions with `getSession`, and
handle a form POST from a page by adding `export const action`. If island
hot-reload silently stops working, Chevalier now warns you once that
`@prefresh/vite` is missing.

_Scaffold:_ the template gains a per-directory `_middleware.ts` route guard and
a page form action (`export const action`), showing both conventions out of the
box.

## 0.0.8

Adds Tailwind v4 support — utility classes work in your pages and islands, in
dev and production.

_Scaffold:_ scaffolds Tailwind v4 wired for dev and production — utility classes
work in your pages and islands out of the box.

## 0.0.7

Fixes an app scaffolded from the published package failing to start because Hono
didn't resolve.

## 0.0.6

Drop files in a `public/` directory and serve them with `serveStatic`; built
`/assets` are sent with long-lived immutable caching. New apps no longer carry a
hand-written server file — `defineApp` is the single entry point. Runs on Vite
8. Fixes islands not resolving when running from the published package.

_Scaffold:_ a refreshed scaffold — a PNG favicon, no server file to maintain, a
`public/` directory for static files, and a README section on deploying to Deno
Deploy. The `-Ar` flag in the scaffold command makes Deno always fetch the
latest version.

## 0.0.5

Editing a route now reloads only the browser tabs viewing that route, instead of
every open tab.

## 0.0.4

Fetch a page's data before render with `export const loader`, and nest islands
inside other islands — adding or removing one during dev updates correctly. New
apps come with a production server. Fixes dynamic routes like `[slug]` not
matching.

_Scaffold:_ scaffolds a production server alongside the dev setup.

## 0.0.3

Initial published release: file-based routing, per-page islands with zero client
JS by default, island hydration, and a CSP nonce on the inline boot script,
alongside the `@chevalier/init` scaffolder.

_Scaffold:_ initial scaffolder release —
`deno run -Ar jsr:@chevalier/init my-app` generates a working Chevalier app (a
page, an island, a static page, a form, and an `/api` handler), ready to
`deno task dev`.
