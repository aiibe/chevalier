import { assertEquals } from "@std/assert";
import { type Context, Hono } from "hono";
import { h } from "preact";
import { buildBoot, createApp, defineApp } from "./server.ts";

Deno.test("buildBoot — no islands ships zero JS", () => {
  assertEquals(buildBoot([], [], {}, "/app/client.ts"), "");
});

Deno.test("buildBoot — imports the page's islands and passes components + props", () => {
  const boot = buildBoot(
    ["islands/counter", "islands/clock"],
    [{ start: 3 }, {}],
    {
      "islands/counter": "/assets/counter-a1b2.js",
      "islands/clock": "/assets/clock-c3d4.js",
      "islands/unused": "/assets/unused.js",
    },
    "/assets/client-x.js",
  );
  assertEquals(
    boot.includes(`import { hydrateIslands } from "/assets/client-x.js";`),
    true,
  );
  assertEquals(boot.includes(`/assets/counter-a1b2.js`), true);
  assertEquals(boot.includes(`/assets/clock-c3d4.js`), true);
  assertEquals(boot.includes("unused"), false);
  assertEquals(
    boot.includes(
      `hydrateIslands([m0.default,m1.default],[{"start":3},{}]);`,
    ),
    true,
  );
});

Deno.test("buildBoot — escapes < in props so it can't break out of </script>", () => {
  const boot = buildBoot(
    ["islands/a"],
    [{ html: "</script><b>" }],
    { "islands/a": "/a.js" },
    "/c.js",
  );
  assertEquals(boot.includes("</script>"), false);
  assertEquals(boot.includes("\\u003c/script>"), true);
});

// Handlers declare file-relative paths (`/`, not `/api`): server.ts strips the
// mount prefix before forwarding to the sub-app. See TODO.md.

Deno.test("handler module receives POST", async () => {
  const handler = new Hono()
    .get("/", (c) => c.text("got GET"))
    .post("/", (c) => c.text("got POST"));

  const app = createApp({
    routes: {
      "/app/routes/api.ts": () => Promise.resolve({ app: handler }),
    },
  });

  const post = await app.request("/api", { method: "POST" });
  assertEquals(post.status, 200);
  assertEquals(await post.text(), "got POST");

  const get = await app.request("/api");
  assertEquals(get.status, 200);
  assertEquals(await get.text(), "got GET");
});

Deno.test("handler sub-paths are relative to the mount", async () => {
  const handler = new Hono().get("/users", (c) => c.text("users"));

  const app = createApp({
    routes: {
      "/app/routes/api.ts": () => Promise.resolve({ app: handler }),
    },
  });

  const res = await app.request("/api/users");
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "users");
});

Deno.test("page route is GET-only — POST falls through to 404", async () => {
  const app = createApp({
    routes: {
      "/app/routes/index.tsx": () =>
        Promise.resolve({ default: () => h("div", null, "home") }),
    },
  });

  assertEquals((await app.request("/")).status, 200);
  assertEquals((await app.request("/", { method: "POST" })).status, 404);
});

Deno.test("page action runs on same-path POST and returns its Response", async () => {
  const app = createApp({
    routes: {
      "/app/routes/index.tsx": () =>
        Promise.resolve({
          action: (c: Context) => c.redirect("/", 303),
          default: () => h("div", null, "home"),
        }),
    },
  });

  const res = await app.request("/", { method: "POST", redirect: "manual" });
  assertEquals(res.status, 303);
  assertEquals(res.headers.get("location"), "/");
});

Deno.test("page action rejects a cross-origin form post (CSRF) with 403", async () => {
  const app = createApp({
    routes: {
      "/app/routes/index.tsx": () =>
        Promise.resolve({
          action: (c: Context) => c.redirect("/", 303),
          default: () => h("div", null, "home"),
        }),
    },
  });

  // Sec-Fetch-Site: cross-site → blocked before the action runs.
  const bySite = await app.request("/", {
    method: "POST",
    headers: { "sec-fetch-site": "cross-site" },
  });
  assertEquals(bySite.status, 403);

  // No Sec-Fetch-Site, mismatched Origin → also blocked.
  const byOrigin = await app.request("http://localhost/", {
    method: "POST",
    headers: { origin: "http://evil.example" },
  });
  assertEquals(byOrigin.status, 403);
});

Deno.test("page action allows a same-origin form post", async () => {
  const app = createApp({
    routes: {
      "/app/routes/index.tsx": () =>
        Promise.resolve({
          action: (c: Context) => c.redirect("/", 303),
          default: () => h("div", null, "home"),
        }),
    },
  });

  const bySite = await app.request("/", {
    method: "POST",
    redirect: "manual",
    headers: { "sec-fetch-site": "same-origin" },
  });
  assertEquals(bySite.status, 303);

  const byOrigin = await app.request("http://localhost/", {
    method: "POST",
    redirect: "manual",
    headers: { origin: "http://localhost" },
  });
  assertEquals(byOrigin.status, 303);
});

Deno.test("POST to a page action sub-path 404s (page owns only its path)", async () => {
  const app = createApp({
    routes: {
      "/app/routes/[id].tsx": () =>
        Promise.resolve({
          action: (c: Context) => c.redirect("/", 303),
          default: () => h("div", null, "page"),
        }),
    },
  });

  // Same-path POST hits the action; a sub-path does not.
  assertEquals(
    (await app.request("/42", { method: "POST", redirect: "manual" })).status,
    303,
  );
  assertEquals(
    (await app.request("/42/extra", { method: "POST" })).status,
    404,
  );
});

Deno.test("createApp injects styles into the default layout <head>", async () => {
  const app = createApp({
    routes: {
      "/app/routes/index.tsx": () =>
        Promise.resolve({ default: () => h("div", null, "home") }),
    },
    styles: [
      { href: "/assets/styles-abc.css", dev: false }, // build → <link>
      { href: "/app/other.css", dev: true }, // dev → <script>
    ],
  });

  const html = await (await app.request("/")).text();
  assertEquals(
    html.includes('<link rel="stylesheet" href="/assets/styles-abc.css"'),
    true,
  );
  assertEquals(
    html.includes('<script type="module" src="/app/other.css"'),
    true,
  );
});

Deno.test("defineApp resolves styles paths against the manifest", async () => {
  const manifest = {
    "app/styles.css": { file: "assets/styles-Zx9.css", name: "styles" },
  };
  const app = defineApp({
    routes: {
      "/app/routes/index.tsx": () =>
        Promise.resolve({ default: () => h("div", null, "home") }),
    },
    devIslandUrls: {},
    manifest,
  });

  const html = await (await app.request("/")).text();
  // Default styles=["app/styles.css"] → hashed asset from the manifest.
  assertEquals(
    html.includes('<link rel="stylesheet" href="/assets/styles-Zx9.css"'),
    true,
  );
});

Deno.test("defineApp with styles:[] links no stylesheet", async () => {
  const app = defineApp({
    routes: {
      "/app/routes/index.tsx": () =>
        Promise.resolve({ default: () => h("div", null, "home") }),
    },
    devIslandUrls: {},
    styles: [],
  });

  const html = await (await app.request("/")).text();
  assertEquals(html.includes("stylesheet"), false);
});

Deno.test("_404 page renders in the layout for unmatched routes", async () => {
  const app = createApp({
    routes: {
      "/app/routes/index.tsx": () =>
        Promise.resolve({ default: () => h("div", null, "home") }),
    },
    notFound: () => h("div", null, "custom 404"),
  });

  const res = await app.request("/missing");
  assertEquals(res.status, 404);
  const html = await res.text();
  assertEquals(html.startsWith("<!DOCTYPE html>"), true);
  assertEquals(html.includes("custom 404"), true);
});

Deno.test("_404 page also catches a page's own c.notFound()", async () => {
  const app = createApp({
    routes: {
      "/app/routes/index.tsx": () =>
        Promise.resolve({ default: () => h("div", null, "home") }),
    },
    notFound: () => h("div", null, "custom 404"),
  });

  // POST to a page is GET-only → dispatch calls c.notFound() → _404.
  const res = await app.request("/", { method: "POST" });
  assertEquals(res.status, 404);
  assertEquals((await res.text()).includes("custom 404"), true);
});

Deno.test("island page emits a scoped boot; island-free page emits none", async () => {
  const { island } = await import("./registry.tsx");
  const Counter = island(() => h("span", null, "c"), "islands/counter");

  const app = createApp({
    routes: {
      "/app/routes/index.tsx": () =>
        Promise.resolve({ default: () => h(Counter, {}) }),
      "/app/routes/about.tsx": () =>
        Promise.resolve({ default: () => h("div", null, "static") }),
    },
    islandUrls: { "islands/counter": "/app/islands/counter.tsx" },
  });

  const home = await (await app.request("/")).text();
  assertEquals(home.includes('<script type="module"'), true);
  assertEquals(home.includes("/app/islands/counter.tsx"), true);
  assertEquals(home.includes("hydrateIslands([m0.default],[{}])"), true);
  assertEquals(home.includes("<!--chevalier:0:0-->"), true);
  assertEquals(home.includes("<!--/chevalier-->"), true);
  assertEquals(home.includes("data-chevalier"), false);

  const about = await (await app.request("/about")).text();
  assertEquals(about.includes("static"), true);
  assertEquals(about.includes("<script"), false); // zero JS
});

Deno.test("boot <script> carries the secureHeaders nonce when set", async () => {
  const { island } = await import("./registry.tsx");
  const Counter = island(() => h("span", null, "c"), "islands/counter");

  // Stand in for hono's secureHeaders middleware, which sets this context key.
  // Registered on the base app *before* createApp mounts routes so it runs first.
  const base = new Hono();
  base.use("*", async (c, next) => {
    (c.set as (k: string, v: unknown) => void)(
      "secureHeadersNonce",
      "test-nonce-123",
    );
    await next();
  });
  const app = createApp({
    app: base,
    routes: {
      "/app/routes/index.tsx": () =>
        Promise.resolve({ default: () => h(Counter, {}) }),
    },
    islandUrls: { "islands/counter": "/app/islands/counter.tsx" },
  });

  const html = await (await app.request("/")).text();
  assertEquals(
    html.includes('<script type="module" nonce="test-nonce-123"'),
    true,
  );
});

Deno.test("boot <script> omits the nonce attr when none is set", async () => {
  const { island } = await import("./registry.tsx");
  const Counter = island(() => h("span", null, "c"), "islands/counter");

  const app = createApp({
    routes: {
      "/app/routes/index.tsx": () =>
        Promise.resolve({ default: () => h(Counter, {}) }),
    },
    islandUrls: { "islands/counter": "/app/islands/counter.tsx" },
  });

  const html = await (await app.request("/")).text();
  assertEquals(html.includes('<script type="module"'), true);
  assertEquals(html.includes("nonce"), false);
});

Deno.test("dynamic-param page matches and exposes params", async () => {
  const app = createApp({
    routes: {
      "/app/routes/[id].tsx": () =>
        Promise.resolve({
          default: (props: { params: { id: string } }) =>
            h("div", null, `id=${props.params.id}`),
        }),
    },
  });

  const res = await app.request("/42");
  assertEquals(res.status, 200);
  assertEquals((await res.text()).includes("id=42"), true);

  // A sub-path under the page still 404s (wildcard mount, pattern mismatch).
  assertEquals((await app.request("/42/extra")).status, 404);
});

Deno.test("loader result merges into page props alongside params", async () => {
  const app = createApp({
    routes: {
      "/app/routes/[id].tsx": () =>
        Promise.resolve({
          loader: (c: Context) => ({ name: "Ada", id: c.req.param("id") }),
          default: (props: { params: { id: string }; name: string }) =>
            h("div", null, `${props.name}#${props.params.id}`),
        }),
    },
  });

  const res = await app.request("/42");
  assertEquals(res.status, 200);
  assertEquals((await res.text()).includes("Ada#42"), true);
});

Deno.test("loader returning a Response short-circuits render", async () => {
  const app = createApp({
    routes: {
      "/app/routes/index.tsx": () =>
        Promise.resolve({
          loader: () =>
            new Response(null, {
              status: 302,
              headers: { location: "/login" },
            }),
          default: () => h("div", null, "should not render"),
        }),
    },
  });

  const res = await app.request("/");
  assertEquals(res.status, 302);
  assertEquals(res.headers.get("location"), "/login");
  assertEquals((await res.text()).includes("should not render"), false);
});

Deno.test("async loader is awaited before render", async () => {
  const app = createApp({
    routes: {
      "/app/routes/index.tsx": () =>
        Promise.resolve({
          loader: () => Promise.resolve({ msg: "fetched" }),
          default: (props: { msg: string }) => h("div", null, props.msg),
        }),
    },
  });

  assertEquals(
    (await (await app.request("/")).text()).includes("fetched"),
    true,
  );
});

Deno.test("_error page renders in the layout when a route throws", async () => {
  const app = createApp({
    routes: {
      "/app/routes/index.tsx": () =>
        Promise.resolve({
          default: () => {
            throw new Error("boom");
          },
        }),
    },
    error: ({ error }) =>
      h("div", null, error instanceof Error ? error.message : String(error)),
  });

  const res = await app.request("/");
  assertEquals(res.status, 500);
  const html = await res.text();
  assertEquals(html.startsWith("<!DOCTYPE html>"), true);
  assertEquals(html.includes("boom"), true);
});
