export default function Hello({ params }: { params?: Record<string, string> }) {
  return <p>hi {params?.name}</p>;
}
