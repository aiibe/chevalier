import { assertEquals } from "@std/assert";
import {
  createMiddleware,
  fileToPath,
  middlewareDirToPath,
  routeMatchesPath,
} from "./router.ts";

Deno.test("fileToPath — index, static, nested, dynamic, catch-all", () => {
  assertEquals(fileToPath("routes/index.tsx"), "/");
  assertEquals(fileToPath("routes/about.tsx"), "/about");
  assertEquals(fileToPath("routes/blog/index.tsx"), "/blog");
  assertEquals(fileToPath("routes/blog/[slug].tsx"), "/blog/:slug");
  assertEquals(fileToPath("routes/files/[...rest].tsx"), "/files/:rest{.+}");
});

Deno.test("routeMatchesPath — static routes", () => {
  assertEquals(routeMatchesPath("routes/index.tsx", "/"), true);
  assertEquals(routeMatchesPath("routes/about.tsx", "/about"), true);
  assertEquals(routeMatchesPath("routes/about.tsx", "/about/"), true); // trailing slash
  // Editing index must not reload a browser on /about (the reported bug).
  assertEquals(routeMatchesPath("routes/index.tsx", "/about"), false);
  assertEquals(routeMatchesPath("routes/about.tsx", "/"), false);
  assertEquals(routeMatchesPath("routes/about.tsx", "/about/extra"), false);
});

Deno.test("routeMatchesPath — dynamic single-segment param", () => {
  assertEquals(routeMatchesPath("routes/blog/[slug].tsx", "/blog/hello"), true);
  assertEquals(routeMatchesPath("routes/blog/[slug].tsx", "/blog/a-b_c"), true);
  // One segment only — deeper paths belong to a catch-all, not :slug.
  assertEquals(routeMatchesPath("routes/blog/[slug].tsx", "/blog/a/b"), false);
  assertEquals(routeMatchesPath("routes/blog/[slug].tsx", "/blog"), false);
});

Deno.test("routeMatchesPath — catch-all spans slashes", () => {
  assertEquals(
    routeMatchesPath("routes/files/[...rest].tsx", "/files/a"),
    true,
  );
  assertEquals(
    routeMatchesPath("routes/files/[...rest].tsx", "/files/a/b/c"),
    true,
  );
  assertEquals(routeMatchesPath("routes/files/[...rest].tsx", "/other"), false);
});

Deno.test("middlewareDirToPath — root, nested, dynamic", () => {
  assertEquals(middlewareDirToPath("routes/_middleware.ts"), "/");
  assertEquals(middlewareDirToPath("routes/admin/_middleware.ts"), "/admin");
  assertEquals(
    middlewareDirToPath("routes/blog/[slug]/_middleware.ts"),
    "/blog/:slug",
  );
});

Deno.test("createMiddleware — discovers _middleware, drops routes, sorts shallow-first", () => {
  const noop = () => Promise.resolve({ default: () => {} });
  const mw = createMiddleware({
    "/app/routes/admin/users/_middleware.ts": noop,
    "/app/routes/admin/_middleware.ts": noop,
    "/app/routes/_middleware.ts": noop,
    "/app/routes/index.tsx": noop, // a page, not middleware
  });
  assertEquals(mw.map((m) => m.prefix), ["/", "/admin", "/admin/users"]);
});
