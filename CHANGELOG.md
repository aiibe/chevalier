# Changelog

All notable changes to `@chevalier/core` are recorded here. The project aims to
follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) once it
reaches `0.1.0` (see [Stability](#stability)).

This changelog tracks the published `@chevalier/core` package. The
`@chevalier/init` scaffolder releases on its own `init-vX.Y.Z` tag track and is
not versioned here.

## Stability

Chevalier is pre-1.0; the API can change between releases. Pin an exact version
and read the entry before upgrading.

- **`0.0.x` (now).** Conventions and public API still moving; any bump may
  break.
- **`0.1.x` (next).** Conventions stabilize; breaks ship only in a new `0.y`
  with a migration note, patches stay compatible.
- **`1.0` (later).** Full [SemVer](https://semver.org), once the surface has
  held steady across real apps.

The `0.1` line is the public surface: the `deno.json` exports, the `app/`
conventions (routes, `_app`/`_layout`/`_404`/`_error`, `_middleware`), and the
loader/action/session contracts.

## Unreleased

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
config.

## 0.0.11

Fixes Preact hooks (`useState` and friends) failing to resolve in an island.

## 0.0.10

**Breaking.** Layouts split three ways: an `_app.tsx` for the outer HTML shell,
nesting `_layout.tsx` components for shared page chrome, and `PageHead` for a
page setting its own `<title>` and `<head>` tags. If you had a single layout,
move the shell markup into `_app.tsx` and per-page `<head>` content into
`PageHead`. Also fixes a page that could break when an island's import path
contained `</script>`.

## 0.0.9

Drop a `_layout.tsx` or `_middleware.ts` into any routes subdirectory and it
applies to that directory's routes — layouts nest, with the nearest one to the
page winning. Read and write signed-cookie sessions with `getSession`, and
handle a form POST from a page by adding `export const action`. If island
hot-reload silently stops working, Chevalier now warns you once that
`@prefresh/vite` is missing.

## 0.0.8

Adds Tailwind v4 support — utility classes work in your pages and islands, in
dev and production.

## 0.0.7

Fixes an app scaffolded from the published package failing to start because Hono
didn't resolve.

## 0.0.6

Drop files in a `public/` directory and serve them with `serveStatic`; built
`/assets` are sent with long-lived immutable caching. New apps no longer carry a
hand-written server file — `defineApp` is the single entry point. Runs on Vite
8. Fixes islands not resolving when running from the published package.

## 0.0.5

Editing a route now reloads only the browser tabs viewing that route, instead of
every open tab.

## 0.0.4

Fetch a page's data before render with `export const loader`, and nest islands
inside other islands — adding or removing one during dev updates correctly. New
apps come with a production server. Fixes dynamic routes like `[slug]` not
matching.

## 0.0.3

Initial published release: file-based routing, per-page islands with zero client
JS by default, island hydration, and a CSP nonce on the inline boot script,
alongside the `@chevalier/init` scaffolder.
