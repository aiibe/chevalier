// Handler route (export const app) → mounted at /api, serving any HTTP method.
// Routes are file-relative: "/" is /api, "/echo" is /api/echo.
import { Hono } from "hono";

const QUOTES = [
  "Ship it.",
  "It works on my machine.",
  "Islands all the way down.",
  "Zero JS until you need it.",
];

export const app = new Hono()
  .get("/", (c) => c.json({ ok: true, route: "/api" }))
  .post("/echo", async (c) => c.json({ echo: await c.req.json() }))
  // Fake data endpoint the Quote island fetches on click. GET /api/quote.
  .get(
    "/quote",
    (c) => c.json({ quote: QUOTES[Math.floor(Math.random() * QUOTES.length)] }),
  );
