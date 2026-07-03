import Counter from "../islands/counter.tsx";
import Quote from "../islands/quote.tsx";

export default function Home() {
  return (
    <div class="space-y-4">
      <h1 class="text-3xl font-bold">Chevalier</h1>
      <p class="text-gray-600">
        A file-routed Deno meta-framework that ships islands, not bundles.
      </p>
      <Counter start={3} />
      <h2 class="pt-4 text-lg font-semibold">
        Fetch — click to load fake data from /api/quote
      </h2>
      <Quote />
    </div>
  );
}
