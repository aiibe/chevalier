// Convention page: rendered for any unmatched route (status 404).
// Wired via defineApp({ notFound }) in the generated SSR app.

export default function NotFound() {
  return (
    <div>
      <h1>404 — Not found</h1>
      <p>
        Nothing here. <a href="/">Go home</a>.
      </p>
    </div>
  );
}
