import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { getSession } from "./session.ts";

const SECRET = "test-secret";

// Round-trips the session cookie through a real Hono app: one route sets it,
// the next reads it back with the returned Set-Cookie header replayed.
function appWith(
  routes: (app: Hono) => void,
): (path: string, cookie?: string) => Promise<Response> {
  const app = new Hono();
  routes(app);
  return (path, cookie) =>
    Promise.resolve(app.request(path, cookie ? { headers: { cookie } } : {}));
}

// hono's setSignedCookie emits `name=value.signature; …attrs`; the browser sends
// back just `name=value.signature`. Strip attrs so a replay looks like a browser.
function cookiePair(setCookie: string): string {
  return setCookie.split(";")[0];
}

Deno.test("set writes a signed cookie the next request reads back", async () => {
  const request = appWith((app) => {
    app.get("/login", async (c) => {
      const s = await getSession<{ userId: number }>(c, SECRET);
      await s.set({ userId: 42 });
      return c.text("ok");
    });
    app.get("/me", async (c) => {
      const s = await getSession<{ userId: number }>(c, SECRET);
      return c.json(s.data);
    });
  });

  const login = await request("/login");
  const cookie = cookiePair(login.headers.get("set-cookie")!);

  const me = await request("/me", cookie);
  assertEquals(await me.json(), { userId: 42 });
});

Deno.test("absent cookie yields empty data", async () => {
  const request = appWith((app) => {
    app.get("/me", async (c) => {
      const s = await getSession(c, SECRET);
      return c.json(s.data);
    });
  });
  const res = await request("/me");
  assertEquals(await res.json(), {});
});

Deno.test("a tampered signature decodes to empty data", async () => {
  const request = appWith((app) => {
    app.get("/set", async (c) => {
      const s = await getSession<{ userId: number }>(c, SECRET);
      await s.set({ userId: 7 });
      return c.text("ok");
    });
    app.get("/me", async (c) => {
      const s = await getSession(c, SECRET);
      return c.json(s.data);
    });
  });

  const set = await request("/set");
  const cookie = cookiePair(set.headers.get("set-cookie")!);
  // Flip a byte in the value so the HMAC no longer verifies.
  const tampered = cookie.replace(/.$/, (ch) => (ch === "A" ? "B" : "A"));

  const res = await request("/me", tampered);
  assertEquals(await res.json(), {});
});

Deno.test("set merges into existing data across requests", async () => {
  const request = appWith((app) => {
    app.get("/a", async (c) => {
      const s = await getSession<{ a: number; b: number }>(c, SECRET);
      await s.set({ a: 1 });
      return c.text("ok");
    });
    app.get("/b", async (c) => {
      const s = await getSession<{ a: number; b: number }>(c, SECRET);
      await s.set({ b: 2 });
      return c.json(s.data);
    });
  });

  const a = await request("/a");
  const res = await request("/b", cookiePair(a.headers.get("set-cookie")!));
  assertEquals(await res.json(), { a: 1, b: 2 });
});

Deno.test("destroy expires the cookie", async () => {
  const request = appWith((app) => {
    app.get("/logout", async (c) => {
      const s = await getSession(c, SECRET);
      s.destroy();
      return c.text("ok");
    });
  });
  const res = await request("/logout");
  const setCookie = res.headers.get("set-cookie")!;
  // deleteCookie sets Max-Age=0 (browsers drop it immediately).
  assertEquals(setCookie.toLowerCase().includes("max-age=0"), true);
});

Deno.test("options.name uses a custom cookie name", async () => {
  const request = appWith((app) => {
    app.get("/set", async (c) => {
      const s = await getSession(c, SECRET, { name: "sid" });
      await s.set({ x: 1 });
      return c.text("ok");
    });
  });
  const res = await request("/set");
  assertEquals(res.headers.get("set-cookie")!.startsWith("sid="), true);
});

for (const host of ["localhost", "127.0.0.1"]) {
  Deno.test(`secure is omitted on ${host} so the cookie survives HTTP dev`, async () => {
    const app = new Hono();
    app.get("/set", async (c) => {
      const s = await getSession(c, SECRET);
      await s.set({ x: 1 });
      return c.text("ok");
    });
    const res = await app.request(`http://${host}/set`);
    const setCookie = res.headers.get("set-cookie")!.toLowerCase();
    assertEquals(setCookie.includes("secure"), false);
  });
}

Deno.test("secure is set on a non-localhost host", async () => {
  const app = new Hono();
  app.get("/set", async (c) => {
    const s = await getSession(c, SECRET);
    await s.set({ x: 1 });
    return c.text("ok");
  });
  const res = await app.request("https://app.example.com/set");
  const setCookie = res.headers.get("set-cookie")!.toLowerCase();
  assertEquals(setCookie.includes("secure"), true);
});
