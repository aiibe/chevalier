// Island (under islands/). Interactive on the client after hydration.
import { useState } from "preact/hooks";

export default function Counter({ start = 0 }: { start?: number }) {
  const [n, setN] = useState(start);
  return (
    <button type="button" onClick={() => setN((v) => v + 1)}>
      counts: {n}
    </button>
  );
}
