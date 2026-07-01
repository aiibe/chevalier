<div align="center">

# @chevalier/init

Quick-start scaffolder for [Chevalier](https://jsr.io/@chevalier/core).

</div>

Create a new Chevalier app in one command:

```sh
deno run -A jsr:@chevalier/init my-app
cd my-app
deno install
deno task dev
```

Pass no directory and it prompts for one (defaults to `my-chevalier-app`).

## What you get

A minimal working app wired exactly like [`examples/basic`](../examples/basic):

```
my-app/
  deno.json            # tasks + import map, pinned to @chevalier/core
  vite.config.ts       # the chevalier() Vite plugin
  app/
    server.ts          # SSR entry (globs routes, createApp)
    routes/
      _layout.tsx      # document shell
      _404.tsx  _error.tsx
      index.tsx  about.tsx   # a page with an island, and one with none
      api.ts           # export const app → Hono sub-app at /api
    islands/
      counter.tsx      # hydrates on the client
```

Edit `counter.tsx` and it hot-updates with state preserved. Edit a route or
`_layout.tsx` and the page does a full reload.
