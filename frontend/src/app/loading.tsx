/** While a page loads: a small body going round its orbit. */
export default function Loading() {
  return (
    <div className="page loading-stage" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="orbit-loader" aria-hidden>
        <span />
      </div>
      <p className="muted small">On the way…</p>
    </div>
  );
}
