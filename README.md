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
- 🦕 **Deno-native.** JSR package, Vite dev server, no `package.json`.

## Getting started

Scaffold a fresh app in one command:

```sh
deno run -A jsr:@chevalier/init my-app
cd my-app
deno install
deno task dev
```

Open the printed URL. You get a working app with a page, an island, a static
page, and a `/api` handler — edit the island and it hot-updates in place.

Or add Chevalier to an existing project:

```sh
deno add jsr:@chevalier/core
```

```ts
import { createApp } from "@chevalier/core";
```

Or run the bundled example to see everything working.

```sh
cd examples/basic
deno install
deno task dev
```

Open the printed URL. Edit an island and it hot-updates in place, keeping its
state. Edit a route or `_layout.tsx` and the page does a full reload.

```sh
deno task dev       # vite dev server
deno task build     # client + SSR build
deno task preview   # preview the build
```

## Pages

A page is a default-exported Preact component under `app/routes/**`. It renders
inside the layout and is GET-only. Other methods 404.

```tsx
// app/routes/about.tsx  →  GET /about
export default function About() {
  return <h1>About</h1>;
}
```

The filename is the URL. `index.tsx` → `/`, `blog/[slug].tsx` → `/blog/:slug`
(read it with `c.req.param("slug")`), and `docs/[...rest].tsx` catches
`/docs/a/b/c`. `_`-prefixed files are convention, never routes.

### Loading data

A page also gets its route `params` as a prop. To fetch data before render,
`export const loader` — it runs with the Hono context, and whatever object it
returns is merged into the page props. It may be `async`; render stays sync.
Return a `Response` instead to short-circuit (redirect, 404, custom status).

```tsx
// app/routes/blog/[slug].tsx  →  GET /blog/:slug
import type { PageLoader } from "@chevalier/core";

export const loader: PageLoader = async (c) => {
  const post = await getPost(c.req.param("slug"));
  if (!post) return c.notFound(); // Response → skips render
  return { post };
};

export default function Post({ post }: { post: Post }) {
  return <article>{post.title}</article>;
}
```

## Handlers

Any route file can `export const app`, a Hono sub-app that serves any HTTP
method. Its routes are **file-relative**. A handler at `routes/api.ts` declares
`.get("/")` for `GET /api` and `.post("/echo")` for `POST /api/echo`.

```ts
// app/routes/api.ts  →  mounted at /api
import { Hono } from "hono";

export const app = new Hono()
  .get("/", (c) => c.json({ ok: true })) // GET  /api
  .post("/echo", async (c) => c.json({ echo: await c.req.json() })); // POST /api/echo
```

## Islands

An island is a component that hydrates on the client. Make one by putting it
under `app/islands/` (reserved at any depth). There is no `island()` wrapper. Its
**default export** hydrates.

| Where                    | Example                   |
| ------------------------ | ------------------------- |
| **Under `app/islands/`** | `app/islands/counter.tsx` |

```tsx
// app/islands/counter.tsx (interactive on the client after hydration)
import { useState } from "preact/hooks";

export default function Counter({ start = 0 }: { start?: number }) {
  const [n, setN] = useState(start);
  return (
    <button type="button" onClick={() => setN((v) => v + 1)}>
      counts: {n}
    </button>
  );
}
```

Import it into a page like any component and pass props. Chevalier serializes
the props and hydrates the island in the browser. A page that renders no islands
emits no client script at all.

## Layout and error pages

`_layout.tsx` wraps every page. `_404.tsx` and `_error.tsx` are opt-in. Import
their default exports and pass them to `createApp`.

```ts
import Layout from "./routes/_layout.tsx";
import NotFound from "./routes/_404.tsx";
import ErrorPage from "./routes/_error.tsx";

createApp({ routes, layout: Layout, notFound: NotFound, error: ErrorPage });
```

`notFound` renders with status 404 for any unmatched route (and for a page's own
`c.notFound()`). `error` renders with status 500 and receives the thrown `error`
as a prop. Omit either to fall back to Hono's defaults.

## Alternatives

Chevalier is inspired by these. Reach for them if they fit better.

- [HonoX](https://github.com/honojs/honox). The closest shape. File routing and
  islands on Hono, with its own view layer instead of Preact.
- [Fresh](https://github.com/denoland/fresh). The Deno-native standard. Islands,
  file routing, and zero client JS by default, rendered with Preact.

## Documentation

Full docs are on the way. For a complete working app in the meantime, see
[`examples/basic`](./examples/basic).
