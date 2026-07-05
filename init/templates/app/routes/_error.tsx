// Rendered when a route throws (500); wired via defineApp({ error }).
// The error is logged server-side; keep the visitor message generic.
export default function ErrorPage() {
  return (
    <div>
      <h1>500 — Something went wrong</h1>
      <p>An unexpected error occurred. Please try again.</p>
      <p>
        <a href="/">Go home</a>.
      </p>
    </div>
  );
}
