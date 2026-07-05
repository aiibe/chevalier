import { PageHead } from "chevalier";

export default function About() {
  return (
    <div>
      <PageHead>
        <title>About — Chevalier</title>
        <meta name="description" content="About the Chevalier basic example." />
      </PageHead>
      <h1>About</h1>
      <p>
        This page is fully server-rendered static HTML — no island, no client JS
        for its content. Edit this file in dev to see a full page reload.
      </p>
      <p>
        Its <code>&lt;title&gt;</code> and description come from a page-level
        {" "}
        <code>&lt;PageHead&gt;</code>, overriding the shell default.
      </p>
    </div>
  );
}
