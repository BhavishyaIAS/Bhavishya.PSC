/**
 * The notes flow's progress marker. Usually "1 Syllabus topic → 2 Type of notes"; where the Notes modules
 * have syllabi of their own (kindFirst), the type of notes comes first: "1 Type of notes → 2 Syllabus topic".
 */
export function NotesSteps({ current, kindFirst = false }: { current: 1 | 2; kindFirst?: boolean }) {
  const labels = kindFirst ? ["Type of notes", "Syllabus topic"] : ["Syllabus topic", "Type of notes"];
  return (
    <ol className="flow-steps" aria-label="Steps">
      {labels.map((label, i) => (
        <li key={label} aria-current={current === i + 1 ? "step" : undefined} className={current > i + 1 ? "done" : undefined}>
          <span className="fs-num">{i + 1}</span> {label}
        </li>
      ))}
    </ol>
  );
}
