// Form POST paved path: `loader` reads, `action` writes, both on this path.
// The <form> posts to itself; action mutates then 303-redirects, the browser
// re-GETs, and loader re-runs with the new entry. See README's forms section.
import type { PageAction, PageLoader, PageProps } from "chevalier";

interface Entry {
  message: string;
  at: string;
}

// Stand-in store; a real app writes to its own database in the action.
const entries: Entry[] = [
  { message: "Islands all the way down.", at: "2026-07-04T00:00:00.000Z" },
];

export const loader = (() => ({ entries })) satisfies PageLoader;

export const action: PageAction = async (c) => {
  const message = (await c.req.formData()).get("message")?.toString().trim();
  if (message) entries.unshift({ message, at: new Date().toISOString() });
  return c.redirect(c.req.path, 303);
};

export default function Guestbook(props: PageProps<typeof loader>) {
  const { entries } = props;
  return (
    <div>
      <h1 class="text-2xl font-semibold">Guestbook</h1>
      <p class="mt-1 text-gray-500">
        A mutating form with no client JS — GET renders, POST writes, then a 303
        redirect re-runs the loader.
      </p>

      <form method="post" class="mt-6 flex gap-2">
        <label class="sr-only" for="message">Message</label>
        <input
          id="message"
          name="message"
          required
          autoFocus
          maxLength={140}
          placeholder="Leave a message"
          class="flex-1 rounded border border-gray-300 px-3 py-2 focus:border-gray-800 focus:outline-none"
        />
        <button
          type="submit"
          class="rounded bg-gray-800 px-4 py-2 text-white hover:bg-gray-900"
        >
          Sign
        </button>
      </form>

      <h2 class="mt-8 text-sm font-medium text-gray-500">
        {entries.length} {entries.length === 1 ? "entry" : "entries"}
      </h2>
      {entries.length === 0
        ? <p class="mt-2 text-gray-400">No messages yet — be the first.</p>
        : (
          <ol class="mt-2 divide-y divide-gray-100">
            {entries.map((e) => (
              <li key={e.at} class="flex justify-between gap-4 py-2">
                <span>{e.message}</span>
                <time
                  dateTime={e.at}
                  class="shrink-0 text-sm text-gray-400 tabular-nums"
                >
                  {new Date(e.at).toLocaleDateString()}
                </time>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}
