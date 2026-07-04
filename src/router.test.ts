import { assertEquals } from "@std/assert";
import {
  conventionDirToPath,
  createLayouts,
  createMiddleware,
  fileToPath,
  resolveLayout,
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

Deno.test("conventionDirToPath — root, nested, dynamic, layout", () => {
  assertEquals(conventionDirToPath("routes/_middleware.ts"), "/");
  assertEquals(conventionDirToPath("routes/admin/_middleware.ts"), "/admin");
  assertEquals(conventionDirToPath("routes/admin/_layout.tsx"), "/admin");
  assertEquals(
    conventionDirToPath("routes/blog/[slug]/_middleware.ts"),
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

Deno.test("createLayouts — discovers _layout, drops routes, sorts deep-first", () => {
  const noop = () => Promise.resolve({ default: () => {} });
  const layouts = createLayouts({
    "/app/routes/_layout.tsx": noop,
    "/app/routes/admin/_layout.tsx": noop,
    "/app/routes/index.tsx": noop, // a page, not a layout
    "/app/routes/admin/_middleware.ts": noop, // middleware, not a layout
  });
  assertEquals(layouts.map((l) => l.prefix), ["/admin", "/"]);
});

Deno.test("resolveLayout — nearest ancestor wins, segment-aware", () => {
  const noop = () => Promise.resolve({ default: () => {} });
  const layouts = createLayouts({
    "/app/routes/_layout.tsx": noop,
    "/app/routes/admin/_layout.tsx": noop,
  });
  assertEquals(resolveLayout("/", layouts)?.prefix, "/");
  assertEquals(resolveLayout("/about", layouts)?.prefix, "/");
  assertEquals(resolveLayout("/admin", layouts)?.prefix, "/admin");
  assertEquals(resolveLayout("/admin/users", layouts)?.prefix, "/admin");
  // "/administrators" must not match the "/admin" prefix (segment boundary).
  assertEquals(resolveLayout("/administrators", layouts)?.prefix, "/");
});

Deno.test("resolveLayout — no ancestor → undefined (built-in shell)", () => {
  const noop = () => Promise.resolve({ default: () => {} });
  const layouts = createLayouts({ "/app/routes/admin/_layout.tsx": noop });
  assertEquals(resolveLayout("/about", layouts), undefined);
  assertEquals(resolveLayout("/admin/x", layouts)?.prefix, "/admin");
});
