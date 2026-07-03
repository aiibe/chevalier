// Island (under islands/). Interactive on the client after hydration.
import { useState } from "preact/hooks";

export default function Counter({ start = 0 }: { start?: number }) {
  const [n, setN] = useState(start);
  return (
    <button
      type="button"
      onClick={() => setN((v) => v + 1)}
      class="rounded bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-700"
    >
      counts: {n}
    </button>
  );
}
