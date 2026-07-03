// Rendered when a route throws (status 500). Wired via defineApp({ error }).
export default function ErrorPage({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div>
      <h1>500 — Something went wrong</h1>
      <p>{message}</p>
      <p>
        <a href="/">Go home</a>.
      </p>
    </div>
  );
}
