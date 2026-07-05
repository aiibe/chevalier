import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { setSignedCookie } from "hono/cookie";
import { getSession, type SessionOptions } from "./session.ts";

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
function sessionCookie(res: Response): string {
  return res.headers.get("set-cookie")!.split(";")[0];
}

// Sets { x: 1 } on a fresh app and returns the Set-Cookie header, for tests
// that only inspect cookie attributes.
async function setCookieHeader(
  url = "/set",
  opts?: SessionOptions,
): Promise<string> {
  const app = new Hono();
  app.get("/set", async (c) => {
    const s = await getSession(c, SECRET, opts);
    await s.set({ x: 1 });
    return c.text("ok");
  });
  const res = await app.request(url);
  return res.headers.get("set-cookie")!;
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
  const me = await request("/me", sessionCookie(login));
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
  // Flip a byte in the value so the HMAC no longer verifies.
  const tampered = sessionCookie(set).replace(
    /.$/,
    (ch) => (ch === "A" ? "B" : "A"),
  );

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
  const res = await request("/b", sessionCookie(a));
  assertEquals(await res.json(), { a: 1, b: 2 });
});

Deno.test("set stamps Max-Age (7-day default)", async () => {
  const setCookie = (await setCookieHeader()).toLowerCase();
  assertEquals(setCookie.includes(`max-age=${60 * 60 * 24 * 7}`), true);
});

// Crafts validly-signed cookies directly so we can control `exp` without
// faking the clock.
for (
  const [label, payload] of [
    ["an expired session", { data: { userId: 9 }, exp: Date.now() - 1000 }],
    ["a pre-exp legacy payload", { userId: 9 }],
  ] as const
) {
  Deno.test(`${label} decodes to empty data`, async () => {
    const request = appWith((app) => {
      app.get("/craft", async (c) => {
        await setSignedCookie(c, "session", JSON.stringify(payload), SECRET);
        return c.text("ok");
      });
      app.get("/me", async (c) => {
        const s = await getSession(c, SECRET);
        return c.json(s.data);
      });
    });
    const craft = await request("/craft");
    const res = await request("/me", sessionCookie(craft));
    assertEquals(await res.json(), {});
  });
}

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

Deno.test("a cookie signed with a rotated-out secret still verifies", async () => {
  const OLD = "old-secret";
  const NEW = "new-secret";
  const request = appWith((app) => {
    app.get("/login", async (c) => {
      const s = await getSession<{ userId: number }>(c, OLD);
      await s.set({ userId: 42 });
      return c.text("ok");
    });
    // Reads with NEW first, OLD as fallback.
    app.get("/me", async (c) => {
      const s = await getSession<{ userId: number }>(c, [NEW, OLD]);
      return c.json(s.data);
    });
  });

  const login = await request("/login");
  const me = await request("/me", sessionCookie(login));
  assertEquals(await me.json(), { userId: 42 });
});

Deno.test("an array secret signs with the first entry", async () => {
  const NEW = "new-secret";
  const request = appWith((app) => {
    app.get("/login", async (c) => {
      const s = await getSession<{ userId: number }>(c, [NEW, "old-secret"]);
      await s.set({ userId: 7 });
      return c.text("ok");
    });
    // Only the first (signing) secret should read it back.
    app.get("/me", async (c) => {
      const s = await getSession<{ userId: number }>(c, NEW);
      return c.json(s.data);
    });
  });

  const login = await request("/login");
  const me = await request("/me", sessionCookie(login));
  assertEquals(await me.json(), { userId: 7 });
});

Deno.test("options.name uses a custom cookie name", async () => {
  const setCookie = await setCookieHeader("/set", { name: "sid" });
  assertEquals(setCookie.startsWith("sid="), true);
});

for (const host of ["localhost", "127.0.0.1"]) {
  Deno.test(`secure is omitted on ${host} so the cookie survives HTTP dev`, async () => {
    const setCookie = (await setCookieHeader(`http://${host}/set`))
      .toLowerCase();
    assertEquals(setCookie.includes("secure"), false);
  });
}

Deno.test("secure is set on a non-localhost host", async () => {
  const setCookie = (await setCookieHeader("https://app.example.com/set"))
    .toLowerCase();
  assertEquals(setCookie.includes("secure"), true);
});
