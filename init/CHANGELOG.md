# Changelog

Changes to `@chevalier/init`, the scaffolder run by
`deno run -Ar jsr:@chevalier/init`. It tracks its own `init-vX.Y.Z` tags,
separate from `@chevalier/core` (whose history lives in
[`../CHANGELOG.md`](../CHANGELOG.md)). The scaffolder embeds a working app that
uses `@chevalier/core`, so it also re-releases when a core change reshapes what
gets scaffolded.

Pre-1.0; see the core changelog's [stability policy](../CHANGELOG.md#stability).

## Unreleased

The generated app ships a leaner import map — only the entries it uses. It also
picks up core's latest: loader data typed through to your pages, Tailwind and
styles set in `chevalierConfig`, and errors logged server-side.

## 0.0.10

Version bump to track the matching `@chevalier/core` release; no scaffold
changes.

## 0.0.9

The generated app now shows the new layout model: an `_app.tsx` shell, a nesting
`_layout.tsx`, and a page setting its own `<head>` with `PageHead`.

## 0.0.8

The template gains a per-directory `_middleware.ts` route guard and a page form
action (`export const action`), showing both conventions out of the box.

## 0.0.7

Scaffolds Tailwind v4, wired for dev and production — utility classes work in
your pages and islands out of the box.

## 0.0.6

Fixes a freshly scaffolded app failing to start because Hono didn't resolve.

## 0.0.5

A refreshed scaffold: a PNG favicon, no server file to maintain, a `public/`
directory for static files, and a README section on deploying to Deno Deploy.
Runs on Vite 8. The `-Ar` flag in the scaffold command makes Deno always fetch
the latest version.

## 0.0.4

Version bump to track the matching `@chevalier/core` release; no scaffold
changes.

## 0.0.3

Scaffolds a production server alongside the dev setup.

## 0.0.2

Initial scaffolder release: `deno run -Ar jsr:@chevalier/init my-app` generates
a working Chevalier app — a page, an island, a static page, a form, and an
`/api` handler — ready to `deno task dev`.
