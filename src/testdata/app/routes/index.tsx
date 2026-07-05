export function loader() {
  return { greeting: "hello from loader" };
}

export default function Home({ greeting }: { greeting?: string }) {
  return <h1>{greeting}</h1>;
}
