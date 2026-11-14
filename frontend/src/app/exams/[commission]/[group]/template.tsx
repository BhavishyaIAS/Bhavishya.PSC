/** Re-mounted on every navigation, so each page makes a short 3D entrance (see .page-enter). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
