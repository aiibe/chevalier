// Dynamic-param page with a loader: /hello/ada → props { params, greeting }.
// PageProps<typeof loader> types the loader's payload through to the page.
import type { PageLoader, PageProps } from "chevalier";

export const loader = ((c) => {
  const name = c.req.param("name");
  return { greeting: `Hello, ${name}!`, at: new Date().toISOString() };
}) satisfies PageLoader;

export default function Hello(props: PageProps<typeof loader>) {
  return (
    <div>
      <h1>{props.greeting}</h1>
      <p>
        Rendered server-side at {props.at} for param{" "}
        <code>{props.params.name}</code> — no client JS.
      </p>
    </div>
  );
}
