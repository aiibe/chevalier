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
    <div>
      <h1>Greet</h1>
      <form method="get">
        <input name="name" placeholder="your name" />
        <button type="submit">greet</button>
      </form>
      {props.greeting ? <p>{props.greeting}</p> : null}
    </div>
  );
}
