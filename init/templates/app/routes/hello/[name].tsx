// Dynamic-param page with a loader: /hello/ada → props { params, greeting }.
import type { PageLoader } from "chevalier";

export const loader: PageLoader = (c) => {
  const name = c.req.param("name");
  return { greeting: `Hello, ${name}!`, at: new Date().toISOString() };
};

export default function Hello(
  props: { params: { name: string }; greeting: string; at: string },
) {
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
