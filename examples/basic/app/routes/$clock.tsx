// Island (Rule B: $-prefixed filename, colocated next to the routes that use
// it). Ticks on the client after hydration.

import { useEffect, useState } from "preact/hooks";

export default function Clock() {
  const [now, setNow] = useState(() => new Date().toLocaleTimeString());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);
  return <time>{now}</time>;
}
