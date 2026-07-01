# {{NAME}}

A [Chevalier](https://jsr.io/@chevalier/core) app.

```sh
deno install
deno task dev       # start the dev server
deno task check     # format, lint, and type-check
```

Routes live in `app/routes/`, islands in `app/islands/`.

## Production

```sh
deno task build     # build the app
deno task start     # serve the build
```

Set `PORT` to change the port (default 8000).
