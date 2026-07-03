<div align="center">

# @chevalier/init

Quick-start scaffolder for [Chevalier](https://jsr.io/@chevalier/core).

</div>

Create a new Chevalier app in one command:

```sh
deno run -Ar jsr:@chevalier/init my-app
cd my-app
deno install
deno task dev
```

Pass no directory and it prompts for one (defaults to `my-chevalier-app`).

## What you get

A minimal working app to start from:

- A home page with an interactive island, and an about page with none
- A form page that reads its input server-side
- A layout, plus 404 and error pages
- An `/api` handler
- Tailwind v4, wired for dev and production
- A hot-reloading dev server

Edit the island and it hot-updates with its state preserved. Edit a page or the
layout and it does a full reload.
