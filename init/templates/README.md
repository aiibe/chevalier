# {{NAME}}

A [Chevalier](https://jsr.io/@chevalier/core) app.

```sh
deno install
deno task dev       # start the dev server
deno task check     # format, lint, and type-check
```

Routes live in `app/routes/`, islands in `app/islands/`. Static files (favicon,
robots.txt, images) go in `public/` and are served from the site root.

Styling is [Tailwind](https://tailwindcss.com) v4 — write utility classes in any
component. Add your own CSS or `@theme` in `app/styles.css`.

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
deployctl deploy --include=dist --include=deno.json --include=deno.lock --entrypoint=server.prod.ts
```

## Deploy with Docker

The `Dockerfile` builds the app and ships it on a distroless image. `expose`
publishes port 8000 only to other containers, so run behind a reverse proxy — or
map it to the host with `docker run -p 8000:8000`.

```sh
docker build -t {{NAME}} .
docker run -p 8000:8000 {{NAME}}
```

Or copy `compose.example.yaml` to `compose.yaml` and run `docker compose up`.
