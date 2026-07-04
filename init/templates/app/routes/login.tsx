// Not under /admin, so the guard doesn't touch it. The action sets a session,
// then redirects into the guarded area.
import type { PageAction } from "chevalier";
import { getSession } from "chevalier";

const SECRET = Deno.env.get("SESSION_SECRET") ?? "dev-only-not-secret";

export const action: PageAction = async (c) => {
  const session = await getSession<{ user: string }>(c, SECRET);
  await session.set({ user: "demo" });
  return c.redirect("/admin", 303);
};

export default function Login() {
  return (
    <div>
      <h1 class="text-2xl font-semibold">Sign in</h1>
      <p class="mt-1 text-gray-500">
        No real auth — this just sets a demo session so the guarded{" "}
        <a href="/admin" class="underline">/admin</a> page opens.
      </p>
      <form method="post" class="mt-6">
        <button
          type="submit"
          class="rounded bg-gray-800 px-4 py-2 text-white hover:bg-gray-900"
        >
          Sign in as demo
        </button>
      </form>
    </div>
  );
}
