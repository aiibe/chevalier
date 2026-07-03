// Form + loader example. Pages are GET-only, so the form GETs back here and the
// loader reads the query; returning a Response (the redirect) short-circuits render.
import type { PageLoader } from "chevalier";

export const loader: PageLoader = (c) => {
  const name = c.req.query("name");
  if (name === undefined) return {}; // first visit, no submission yet
  // Empty submission → redirect back to the clean form, no error state to render.
  if (name.trim() === "") return c.redirect("/greet");
  return { greeting: `Hello, ${name.trim()}!` };
};

export default function Greet(props: { greeting?: string }) {
  return (
    <div class="space-y-4">
      <h1 class="text-3xl font-bold">Greet</h1>
      <form method="get" class="flex gap-2">
        <input
          name="name"
          placeholder="your name"
          class="rounded border border-gray-300 px-3 py-1.5"
        />
        <button
          type="submit"
          class="rounded bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-700"
        >
          greet
        </button>
      </form>
      {props.greeting ? <p class="text-gray-600">{props.greeting}</p> : null}
    </div>
  );
}
