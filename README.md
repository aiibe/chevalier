<p align="center">
  <img src="./assets/chevalier.png" alt="Chevalier mascot" width="160" />
</p>

<div align="center">

# Chevalier

<h3><em>A file-routed Deno meta-framework<br />that ships islands, not bundles.</em></h3>

</div>

<br />

<p align="center">
  <a href="https://jsr.io/@chevalier/core"><img src="https://jsr.io/badges/@chevalier/core" alt="JSR" /></a>
  <a href="https://jsr.io/@chevalier/core"><img src="https://jsr.io/badges/@chevalier/core/score" alt="JSR Score" /></a>
  <a href="https://deno.com"><img src="https://img.shields.io/badge/Built%20with-Deno-000?logo=deno&logoColor=white" alt="Built with Deno" /></a>
  <a href="https://preactjs.com"><img src="https://img.shields.io/badge/view-Preact-673ab8?logo=preact&logoColor=white" alt="Preact" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue" alt="License: MIT" /></a>
</p>

**Chevalier** (_knight_ in French) is a small, file-routed Deno meta-framework
that renders with **Preact** and ships islands, not bundles.

It keeps Hono for the HTTP layer and brings a Preact view layer. A page with no
islands ships **zero** client JavaScript. Adding an island never grows a page
that doesn't use it.

📖 **Full documentation: [chevalier.souk.dev](https://chevalier.souk.dev)**

```tsx
// app/routes/index.tsx  →  GET /
import Counter from "../islands/counter.tsx";

export default function Home() {
  return (
    <main>
      <h1>Chevalier</h1>
      <Counter start={3} /> {/* the only JS this page ships */}
    </main>
  );
}
```

## Features

- 🗂️ **File-based routing.** `routes/index.tsx` → `/`, `blog/[slug].tsx` →
  `/blog/:slug`, `docs/[...rest].tsx` catch-all. Familiar conventions, no
  config.
- 🏝️ **Per-page islands.** Each page ships only the JS for the islands it
  actually rendered. No islands, no `<script>`. An island is declared by _path_,
  never a wrapper in your code.
- ⚡ **Split hot-reload.** Islands hot-update in place with state preserved
  (Preact Fast Refresh). Route and layout edits force a full reload.
- 🔥 **Hono all the way down.** The HTTP layer stays [Hono](https://hono.dev).
  Any route file can `export const app` to serve any method, as a Hono sub-app.
- 🎨 **Tailwind v4.** Scaffolds with [Tailwind](https://tailwindcss.com) wired
  for dev and production — utility classes work in pages and islands out of the
  box.
- 🦕 **Deno-native.** JSR package, Vite dev server, no `package.json`.

## Getting started

Scaffold a fresh app in one command:

```sh
deno run -Ar jsr:@chevalier/init my-app
cd my-app
deno install
deno task dev
```

Open the printed URL. You get a working app — a page, an island, a static page,
a form, and a `/api` handler. Edit the island and it hot-updates in place,
keeping its state; edit a route or `_layout.tsx` and the page does a full
reload.

The scaffolded app comes with these tasks:

```sh
deno task dev       # vite dev server
deno task build     # client + SSR build
deno task preview   # preview the build
```

**Already have a project?** Add the core package and import `defineApp`:

```sh
deno add jsr:@chevalier/core
```

**Just want to look around?** Run the bundled example:

```sh
cd examples/basic && deno install && deno task dev
```

## Documentation

Full docs live at **[chevalier.souk.dev](https://chevalier.souk.dev)**:

- [Introduction](https://chevalier.souk.dev/docs/introduction) ·
  [Getting started](https://chevalier.souk.dev/docs/getting-started)
- [Pages](https://chevalier.souk.dev/docs/pages) — routing, loaders, forms
- [Islands](https://chevalier.souk.dev/docs/islands) — client-side interactivity
- [Handlers](https://chevalier.souk.dev/docs/handlers) — Hono sub-apps for any
  method
- [Layouts and error pages](https://chevalier.souk.dev/docs/layouts) — the app
  shell, nested layouts, `_404`/`_error`
- [Sessions](https://chevalier.souk.dev/docs/sessions) ·
  [Middleware](https://chevalier.souk.dev/docs/middleware) ·
  [Testing](https://chevalier.souk.dev/docs/testing) ·
  [Deployment](https://chevalier.souk.dev/docs/deployment)

Prefer to read code? [`examples/basic`](./examples/basic) is a complete working
app.

## Alternatives

Chevalier is inspired by these. Reach for them if they fit better.

- [HonoX](https://github.com/honojs/honox). The closest shape. File routing and
  islands on Hono, with its own view layer instead of Preact.
- [Fresh](https://github.com/denoland/fresh). The Deno-native standard. Islands,
  file routing, and zero client JS by default, rendered with Preact.

## Stability

Chevalier is pre-1.0; the API can change between releases. Every release is
recorded in the [changelog](./CHANGELOG.md), which also states the
[stability policy](./CHANGELOG.md#stability) and the path from `0.0.x` toward
`0.1` and `1.0`. Pin an exact version and read the entry before upgrading.
