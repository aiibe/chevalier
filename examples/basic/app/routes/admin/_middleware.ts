// Guards /admin and everything under it: no session → redirect to the login
// page. Runs before the page loader/render. See README's middleware section.
import type { PageMiddleware } from "chevalier";
import { getSession } from "chevalier";

// Demo secret so the example runs with no env; a real app sets SESSION_SECRET.
const SECRET = Deno.env.get("SESSION_SECRET") ?? "dev-only-not-secret";

const guard: PageMiddleware = async (c, next) => {
  const session = await getSession<{ user: string }>(c, SECRET);
  if (!session.data.user) return c.redirect("/login");
  await next();
};

export default guard;
