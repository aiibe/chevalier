import Counter from "../../app/islands/counter.tsx";
import Clock from "./$clock.tsx";

export default function Home() {
  return (
    <div>
      <h1>Chevalier</h1>
      <p>A HonoX-shaped Deno meta-framework with a Preact view layer.</p>
      <h2>Island A — islands/ dir (Rule A)</h2>
      <Counter start={3} />
      <h2>Island B — $-prefixed, colocated (Rule B)</h2>
      <Clock />
    </div>
  );
}
