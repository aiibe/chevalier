import type { Context, Next } from "hono";

export default function guard(c: Context, next: Next) {
  if (c.req.header("x-auth") !== "yes") return c.redirect("/login", 302);
  return next();
}
