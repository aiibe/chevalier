# {{NAME}}

A [Chevalier](https://jsr.io/@chevalier/core) app.

```sh
deno install
deno task dev       # vite dev server
deno task build     # client + SSR build
deno task preview   # preview the build
```

Routes live in `app/routes/`, islands in `app/islands/`. A page with no islands
ships zero client JavaScript.
