// Handler route (export const app) → mounted at /api, serving any HTTP method.
// Routes are file-relative: "/" is /api, "/echo" is /api/echo.
import { Hono } from "hono";

export const app = new Hono()
  .get("/", (c) => c.json({ ok: true, route: "/api" }))
  .post("/echo", async (c) => c.json({ echo: await c.req.json() }));
