/** While a page loads: a small 3D book whose pages turn. */
export default function Loading() {
  return (
    <div className="page loading-stage" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="book-loader" aria-hidden>
        <span />
        <span />
        <span />
        <span />
      </div>
      <p className="muted small">Opening the page…</p>
    </div>
  );
}
