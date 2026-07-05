import type { Context } from "hono";

export function action(c: Context) {
  return c.redirect("/", 303);
}

export default function Submit() {
  return (
    <form method="post">
      <button type="submit">go</button>
    </form>
  );
}
