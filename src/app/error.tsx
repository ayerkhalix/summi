"use client";
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <main className="loading-screen">
      <h1>The table hit a snag.</h1>
      <p>Your server-side room state is preserved. Try reconnecting.</p>
      <button className="button primary" onClick={reset}>
        Reconnect
      </button>
    </main>
  );
}
