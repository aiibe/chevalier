// Reached only past the _middleware guard: the loader can trust a session.
import type { PageAction, PageLoader, PageProps } from "chevalier";
import { getSession } from "chevalier";

const SECRET = Deno.env.get("SESSION_SECRET") ?? "dev-only-not-secret";

export const loader = (async (c) => {
  const session = await getSession<{ user: string }>(c, SECRET);
  return { user: session.data.user };
}) satisfies PageLoader;

// Log out, then land on the (now-guarded) page → redirected to /login.
export const action: PageAction = async (c) => {
  const session = await getSession<{ user: string }>(c, SECRET);
  session.destroy();
  return c.redirect("/admin", 303);
};

export default function Admin({ user }: PageProps<typeof loader>) {
  return (
    <div>
      <h1 class="text-2xl font-semibold">Admin</h1>
      <p class="mt-1 text-gray-500">
        A page behind a per-directory <code>_middleware.ts</code>{" "}
        guard. You only see it because a session cookie is set.
      </p>
      <p class="mt-6">
        Signed in as <span class="font-medium">{user}</span>.
      </p>
      <form method="post" class="mt-4">
        <button
          type="submit"
          class="rounded bg-gray-800 px-4 py-2 text-white hover:bg-gray-900"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
