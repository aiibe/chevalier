// Nested-island demo: only Panel gets a hydration marker; it re-renders the
// nested Counter on the client.

import { useState } from "preact/hooks";
import Counter from "./counter.tsx";

export default function Panel() {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)}>
        {open ? "hide" : "show"} counter
      </button>
      {open ? <Counter start={10} /> : null}
    </div>
  );
}
