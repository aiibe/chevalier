import { assertEquals } from "@std/assert";
import { serveStatic } from "./static.ts";

// serveStatic runs against real files, so each test writes a temp fsRoot.
async function withRoot(
  files: Record<string, string>,
  fn: (root: string) => Promise<void>,
): Promise<void> {
  const root = await Deno.makeTempDir();
  try {
    for (const [name, body] of Object.entries(files)) {
      const path = `${root}/${name}`;
      await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), {
        recursive: true,
      });
      await Deno.writeTextFile(path, body);
    }
    await fn(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

Deno.test("serves a file on disk", async () => {
  await withRoot({ "favicon.svg": "<svg/>" }, async (root) => {
    const handler = serveStatic({ fsRoot: root });
    const res = await handler(new Request("http://x/favicon.svg"));
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "<svg/>");
  });
});

Deno.test("missing file falls through to the fallthrough handler", async () => {
  await withRoot({}, async (root) => {
    const handler = serveStatic({
      fsRoot: root,
      fallthrough: () => new Response("ssr", { status: 200 }),
    });
    const res = await handler(new Request("http://x/missing"));
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "ssr");
  });
});

Deno.test("missing file without fallthrough returns serveDir's 404", async () => {
  await withRoot({}, async (root) => {
    const handler = serveStatic({ fsRoot: root });
    const res = await handler(new Request("http://x/missing"));
    assertEquals(res.status, 404);
    await res.body?.cancel();
  });
});

Deno.test("cacheControl is applied per pathname to served files", async () => {
  await withRoot(
    { "assets/app-a1b2.js": "x", "favicon.svg": "<svg/>" },
    async (root) => {
      const handler = serveStatic({
        fsRoot: root,
        cacheControl: (p) =>
          p.startsWith("/assets/")
            ? "public, max-age=31536000, immutable"
            : "public, no-cache",
      });

      const asset = await handler(new Request("http://x/assets/app-a1b2.js"));
      assertEquals(
        asset.headers.get("Cache-Control"),
        "public, max-age=31536000, immutable",
      );
      await asset.body?.cancel();

      const pub = await handler(new Request("http://x/favicon.svg"));
      assertEquals(pub.headers.get("Cache-Control"), "public, no-cache");
      await pub.body?.cancel();
    },
  );
});

Deno.test("cacheControl returning undefined leaves headers untouched", async () => {
  await withRoot({ "favicon.svg": "<svg/>" }, async (root) => {
    const handler = serveStatic({
      fsRoot: root,
      cacheControl: () => undefined,
    });
    const res = await handler(new Request("http://x/favicon.svg"));
    assertEquals(res.headers.get("Cache-Control"), null);
    await res.body?.cancel();
  });
});

Deno.test("cacheControl is not applied to a 404 fallthrough", async () => {
  await withRoot({}, async (root) => {
    const handler = serveStatic({
      fsRoot: root,
      cacheControl: () => "public, no-cache",
      fallthrough: () => new Response("ssr"),
    });
    const res = await handler(new Request("http://x/missing"));
    assertEquals(res.headers.get("Cache-Control"), null);
    assertEquals(await res.text(), "ssr");
  });
});

Deno.test("304 responses still receive Cache-Control", async () => {
  await withRoot({ "favicon.svg": "<svg/>" }, async (root) => {
    const handler = serveStatic({
      fsRoot: root,
      cacheControl: () => "public, no-cache",
    });
    // Round-trip the ETag to force a 304 and prove Cache-Control survives it.
    const first = await handler(new Request("http://x/favicon.svg"));
    const etag = first.headers.get("ETag");
    await first.body?.cancel();

    const res = await handler(
      new Request("http://x/favicon.svg", {
        headers: etag ? { "If-None-Match": etag } : {},
      }),
    );
    assertEquals(res.status, 304);
    assertEquals(res.headers.get("Cache-Control"), "public, no-cache");
    await res.body?.cancel();
  });
});
