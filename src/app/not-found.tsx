import Link from "next/link";
export default function NotFound() {
  return (
    <main className="loading-screen">
      <h1>No table here.</h1>
      <Link className="button primary" href="/">
        Back to SUMMIN
      </Link>
    </main>
  );
}
