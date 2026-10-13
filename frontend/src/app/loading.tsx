export default function Loading() {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="stack">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card" style={{ height: 90, opacity: 0.5 }} />
        ))}
      </div>
    </div>
  );
}
