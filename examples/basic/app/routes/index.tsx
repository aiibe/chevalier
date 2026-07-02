import Counter from "../../app/islands/counter.tsx";
import Panel from "../../app/islands/panel.tsx";
import Clock from "../../app/islands/clock.tsx";
import Quote from "../../app/islands/quote.tsx";

export default function Home() {
  return (
    <div>
      <h1>Chevalier</h1>
      <p>A HonoX-shaped Deno meta-framework with a Preact view layer.</p>
      <h2>Counter</h2>
      <Counter start={3} />
      <h2>Clock</h2>
      <Clock />
      <h2>Nested — an island rendered inside another island</h2>
      <Panel />
      <h2>Fetch — click to load fake data from /api/quote</h2>
      <Quote />
    </div>
  );
}
