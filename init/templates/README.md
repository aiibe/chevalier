# {{NAME}}

A [Chevalier](https://jsr.io/@chevalier/core) app.

```sh
deno install
deno task dev       # start the dev server
deno task check     # format, lint, and type-check
```

Routes live in `app/routes/`, islands in `app/islands/`. Static files (favicon,
robots.txt, images) go in `public/` and are served from the site root.

## Production

```sh
deno task build     # build the app
deno task start     # serve the build
```

Serves on port 8000. To change it, run `deno serve` directly with `--port`
before the entry: `deno serve -A --port 3000 server.prod.ts`.

## Deploy to Deno Deploy

Build first, then ship `dist/` — it's gitignored, so include it explicitly:

```sh
deno task build
deno install -Arf jsr:@deno/deployctl
deployctl deploy --include=dist --include=deno.json --entrypoint=server.prod.ts
```
