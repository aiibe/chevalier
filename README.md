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

Type the loader with `satisfies PageLoader`, then type the page with
`PageProps<typeof loader>` — the payload flows through, so the page can't drift
from what the loader returns:

```tsx
// app/routes/blog/[slug].tsx  →  GET /blog/:slug
import type { PageLoader, PageProps } from "@chevalier/core";

export const loader = (async (c) => {
  const post = await getPost(c.req.param("slug"));
  if (!post) return c.notFound(); // Response → skips render
  return { post };
}) satisfies PageLoader;

export default function Post({ post, params }: PageProps<typeof loader>) {
  return <article>{post.title}</article>;
}
```

### Forms

To handle a form, `export const action` alongside `loader`: `loader` reads on
GET, `action` writes on POST. A `<form method="post">` posts to its own page, so
both live in one file. Return a `303` redirect (normally back to the same path)
— the browser re-GETs and `loader` re-runs with the new state.

```tsx
// app/routes/guestbook.tsx  →  GET renders, POST signs
import type { PageAction, PageLoader, PageProps } from "@chevalier/core";

export const loader = (() => ({ entries: readEntries() })) satisfies PageLoader;

export const action: PageAction = async (c) => {
  const message = (await c.req.formData()).get("message")?.toString();
  if (message) addEntry(message);
  return c.redirect(c.req.path, 303); // PRG: re-GET runs the loader again
};

export default function Guestbook({ entries }: PageProps<typeof loader>) {
  return (
    <form method="post">
      <input name="message" />
      <button type="submit">Sign</button>
    </form>
  );
}
```

Actions are CSRF-protected out of the box: same-origin `<form>` posts just work,
while a cross-origin post from a browser is rejected with a `403`. A post larger
than 1 MiB is rejected with a `413` — plenty for forms; for file uploads, use a
handler and set your own limit.

Use `action` for a form that belongs to a page. For a standalone endpoint with
no page, use a handler (below).

### Sessions

Call `getSession(c, secret)` from a loader or action to read and write a signed
session cookie. Read `session.data`, `await session.set({ … })` to update it,
and `session.destroy()` to log out. Empty `data` means no session — a fresh
visitor, an expired session, or a cookie that failed its signature — so guard on
it.

```tsx
// app/routes/dashboard.tsx  →  guard on a session in the loader
import type { PageLoader } from "@chevalier/core";
import { getSession } from "@chevalier/core";

export const loader: PageLoader = async (c) => {
  const session = await getSession<{ userId: number }>(
    c,
    Deno.env.get("SESSION_SECRET")!,
  );
  if (!session.data.userId) return c.redirect("/login");
  return { userId: session.data.userId };
};
```

The cookie is `HttpOnly` by default and `Secure` except on `localhost` /
`127.0.0.1`, so it survives plain-HTTP dev. Sessions expire after 7 days: the
expiry is signed into the payload and checked on read, so a captured cookie
stops verifying too — and each `set` restamps it, so an active session keeps
rolling. Pass `{ name }` to rename the cookie or `{ cookie }` to override its
attributes — e.g. `{ cookie: { secure: true } }` behind a TLS-terminating proxy,
or `{ cookie: { maxAge } }` for a different lifetime. Set `SESSION_SECRET` to a
long random string. To rotate it without logging everyone out, pass an array
with the new secret first — `getSession(c, [newSecret, oldSecret])` — then drop
the old one once its cookies have aged out.

### Middleware

Drop a `_middleware.ts` in any `app/routes/**` directory and its default export
— a Hono middleware — runs before every page, handler, loader, and action at or
under that directory. Call `next()` to continue; return a `Response` to
short-circuit. This is the declarative place for an auth guard.

```ts
// app/routes/admin/_middleware.ts  →  guards /admin and everything under it
import type { PageMiddleware } from "@chevalier/core";
import { getSession } from "@chevalier/core";

const guard: PageMiddleware = async (c, next) => {
  const session = await getSession<{ userId: number }>(
    c,
    Deno.env.get("SESSION_SECRET")!,
  );
  if (!session.data.userId) return c.redirect("/login");
  await next();
};

export default guard;
```

A `_middleware.ts` guards its own directory index (`/admin`) and its subtree,
but not siblings. Nest directories to layer guards: they compose outer-to-inner,
so `routes/_middleware.ts` wraps `routes/admin/_middleware.ts`. One guard per
directory — compose multiple concerns inside the handler.

### Observability

Logging and metrics are bring-your-own — Chevalier ships no logger. To log every
request, put a `_middleware.ts` at the root of `app/routes`. Drop in Hono's
[`logger`](https://hono.dev/docs/middleware/builtin/logger) for a quick start,
or write your own for structured lines:

```ts
// app/routes/_middleware.ts  →  logs every request
import type { PageMiddleware } from "@chevalier/core";

const log: PageMiddleware = async (c, next) => {
  const start = performance.now();
  await next();
  const ms = (performance.now() - start).toFixed(1);
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`);
};

export default log;
```

For a health check a load balancer or uptime probe can hit, add a handler that
returns `200`:

```ts
// app/routes/health.ts  →  GET /health returns { ok: true }
import { Hono } from "hono";

export const app = new Hono().get("/", (c) => c.json({ ok: true }));
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
under `app/islands/` (reserved at any depth). There is no `island()` wrapper.
Its **default export** hydrates.

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

Drop these files in `app/routes/` and Chevalier picks them up — no wiring:

- `_app.tsx` is the **document shell**: the single `<html>`…`<body>` structure
  wrapping every page. There's one, app-root-only. Render `<Head>` for the
  `<head>` — it adds charset/viewport meta and your stylesheets, and you put the
  app-wide `<title>`, favicon, and any extra tags inside it — and `{children}`
  for the page. Omit the file to use the built-in shell.

  ```tsx
  // app/routes/_app.tsx
  import { Head, type LayoutProps } from "chevalier";

  export default function App({ children }: LayoutProps) {
    return (
      <html lang="en">
        <Head>
          <title>My App</title>
          <link rel="icon" href="/favicon.png" />
        </Head>
        <body>{children}</body>
      </html>
    );
  }
  ```

- `_layout.tsx` is **body-only chrome** (nav, sidebar, footer) wrapping a page.
  Drop one at any level to wrap that directory and everything under it. Layouts
  **nest**: a route gets every ancestor `_layout.tsx`, outer→inner, each
  wrapping the next via `{children}`, all inside the app shell. A route with no
  `_layout.tsx` ancestor renders bare in the shell.

  ```tsx
  // app/routes/_layout.tsx
  import type { LayoutProps } from "chevalier";

  export default function Layout({ children }: LayoutProps) {
    return (
      <>
        <nav>…</nav>
        {children}
      </>
    );
  }
  ```

Per-page head: render `<PageHead>` anywhere in a page's JSX to add tags to
`<head>` — a `<title>`, meta, links. They land in the shell's `<Head>`, and a
page `<title>` overrides the shell default:

```tsx
import { PageHead } from "chevalier";

export default function About() {
  return (
    <>
      <PageHead>
        <title>About — My App</title>
        <meta name="description" content="…" />
      </PageHead>
      <h1>About</h1>
    </>
  );
}
```

- `_404.tsx` renders with status 404 for any unmatched route (and for a page's
  own `c.notFound()`).
- `_error.tsx` renders with status 500 and receives the thrown `error` as a
  prop. The error is also logged server-side via `console.error`.

`_app`, `_404`, and `_error` are opt-in and app-root-only; omit any to fall back
to the built-in shell / Hono's defaults. `_layout.tsx` and `_middleware.ts` (see
[Middleware](#middleware)) are both per-directory.

## Testing

Test loaders, actions, middleware, and rendered pages without booting Vite.
`createTestApp` builds the same app the dev server serves, straight from your
`app/` directory, and every convention applies — pages, `_middleware`,
`_layout`, `_404`, and the rest:

```ts
// tests/routes.test.ts
import { assertEquals } from "@std/assert";
import { createTestApp } from "chevalier/testing";

const app = await createTestApp(new URL("../app", import.meta.url));

Deno.test("home renders", async () => {
  const res = await app.request("/");
  assertEquals(res.status, 200);
});

Deno.test("admin requires login", async () => {
  const res = await app.request("/admin", { redirect: "manual" });
  assertEquals(res.status, 302);
});
```

Run with `deno test -A`. Files named `*.test.*` or `*.spec.*` never become
routes, so colocating tests under `app/routes/` works too.

One difference from the dev server: islands render their server HTML, but the
page carries no client script, so nothing hydrates. Assert on the HTML; check
hydration in the browser.

## Alternatives

Chevalier is inspired by these. Reach for them if they fit better.

- [HonoX](https://github.com/honojs/honox). The closest shape. File routing and
  islands on Hono, with its own view layer instead of Preact.
- [Fresh](https://github.com/denoland/fresh). The Deno-native standard. Islands,
  file routing, and zero client JS by default, rendered with Preact.

## Documentation

Full docs are on the way. For a complete working app in the meantime, see
[`examples/basic`](./examples/basic).
