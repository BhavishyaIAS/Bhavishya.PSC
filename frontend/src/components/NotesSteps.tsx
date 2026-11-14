/** "1 Topic → 2 Type of notes" progress marker for the notes flow. */
export function NotesSteps({ current }: { current: 1 | 2 }) {
  return (
    <ol className="flow-steps" aria-label="Steps">
      {["Syllabus topic", "Type of notes"].map((label, i) => (
        <li key={label} aria-current={current === i + 1 ? "step" : undefined} className={current > i + 1 ? "done" : undefined}>
          <span className="fs-num">{i + 1}</span> {label}
        </li>
      ))}
    </ol>
  );
}
