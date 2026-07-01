import Counter from "../islands/counter.tsx";

export default function Home() {
  return (
    <div>
      <h1>Chevalier</h1>
      <p>A file-routed Deno meta-framework that ships islands, not bundles.</p>
      <Counter start={3} />
    </div>
  );
}
