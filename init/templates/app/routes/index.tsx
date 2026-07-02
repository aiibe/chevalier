import Counter from "../islands/counter.tsx";
import Quote from "../islands/quote.tsx";

export default function Home() {
  return (
    <div>
      <h1>Chevalier</h1>
      <p>A file-routed Deno meta-framework that ships islands, not bundles.</p>
      <Counter start={3} />
      <h2>Fetch — click to load fake data from /api/quote</h2>
      <Quote />
    </div>
  );
}
