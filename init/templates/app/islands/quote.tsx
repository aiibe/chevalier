// Island: fetches fake data from the /api/quote handler on click.

import { useState } from "preact/hooks";

export default function Quote() {
  const [quote, setQuote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchQuote() {
    setLoading(true);
    try {
      const res = await fetch("/api/quote");
      const data = await res.json();
      setQuote(data.quote);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={fetchQuote} disabled={loading}>
        {loading ? "loading…" : "get a quote"}
      </button>
      {quote ? <p>“{quote}”</p> : null}
    </div>
  );
}
