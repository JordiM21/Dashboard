import { formatDateDMY } from "@/lib/dateUtils";
import type { CurriculumLevelDoc, GroupDocWithRecall, GroupHistoryEntry, Student } from "@/lib/types";

// Essential-information cap: a real class can rack up 15+ history entries
// in a month, and this document is one page — showing all of them would
// either overflow it or shrink the type past readable. The count line under
// the header says how many there really were.
const MAX_TOPIC_ROWS = 9;

/** "Group B" -> "Grupo B" for display only — the stored name stays exactly
    what every other view (and the classGroup matching in studentsIn())
    already reads, this just re-spells the one word a parent sees. */
function spanishGroupName(name: string): string {
  return name.replace(/^Group\b/i, "Grupo");
}

function firstNameOf(student: Student): string {
  return student.name.trim().split(" ")[0] || student.name;
}

/** "Daniel", "Daniel y María", "Daniel, María y Luis" — never a bare comma-only list. */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/**
 * The report's actual page, at its own fixed size — rendered identically
 * for the on-screen preview (scaled down to fit the modal) and for print
 * (full size, the browser's print dialog is the "export to PDF" step). One
 * component, two contexts, so the preview is never a guess at what prints.
 *
 * `students` is 1 for a normal report, 2 for siblings/cousins sharing one
 * class and one payment (see ParentReportModal) — the caller guarantees
 * every student passed here is in the same `group`, since a combined page
 * only makes sense when the content (level, topics, lessons) is identical.
 * Chrome text is Spanish — this document goes home to a parent. Level
 * titles and topic names stay exactly as the curriculum stores them
 * (English), same as every other screen in the app; there's no translation
 * for content that doesn't have one.
 */
export default function ParentReportDocument({
  students,
  group,
  level,
  entries,
  rangeStart,
  rangeEnd,
  teacherNote,
  studyMaterial,
}: {
  students: Student[];
  group: GroupDocWithRecall;
  level: CurriculumLevelDoc | undefined;
  entries: GroupHistoryEntry[];
  rangeStart: string;
  rangeEnd: string;
  teacherNote: string;
  studyMaterial: string;
}) {
  const plural = students.length > 1;
  const fullNames = joinNames(students.map((s) => s.name));
  const firstNames = joinNames(students.map(firstNameOf));
  const schedule = students[0]?.schedule;
  const sorted = entries.slice().sort((a, b) => b.date.localeCompare(a.date));
  const visible = sorted.slice(0, MAX_TOPIC_ROWS);
  const masteredCount = entries.filter((e) => e.status === "Mastered").length;

  return (
    <div className="report-page">
      <div className="report-header">
        <div className="report-brand">LET Junior</div>
        <div className="report-header-text">
          <div className="report-title">Reporte de Progreso Mensual</div>
          <div className="report-range">
            {formatDateDMY(rangeStart)} – {formatDateDMY(rangeEnd)}
          </div>
        </div>
      </div>

      <div className="report-student-row">
        <div>
          <div className="report-student-name">{fullNames}</div>
          <div className="report-student-meta">
            {spanishGroupName(group.name)}
            {schedule ? ` · ${schedule}` : ""}
          </div>
        </div>
        {level && (
          <div className="report-level-badge">
            <span className="report-level-emoji">{level.emoji}</span>
            <span>
              Nivel {level.levelNumber} · {level.title}
            </span>
          </div>
        )}
      </div>

      <p className="report-greeting">
        ¡Hola! Así {plural ? "les" : "le"} fue a {firstNames} en {spanishGroupName(group.name)} este mes — {entries.length}{" "}
        clase{entries.length === 1 ? "" : "s"} vista{entries.length === 1 ? "" : "s"}, {masteredCount} tema{masteredCount === 1 ? "" : "s"}{" "}
        dominado{masteredCount === 1 ? "" : "s"}.
      </p>

      <div className="report-section">
        <div className="report-section-title">Lo que vimos</div>
        {visible.length === 0 ? (
          <div className="report-empty">Todavía no hay clases registradas en este rango de fechas.</div>
        ) : (
          <div className="report-topics">
            {visible.map((e) => (
              <div key={e.id} className="report-topic-row">
                <span className={`report-topic-status ${e.status === "Mastered" ? "mastered" : "review"}`}>
                  {e.status === "Mastered" ? "✓" : "↻"}
                </span>
                <span className="report-topic-name">{e.topic}</span>
                <span className="report-topic-date">{formatDateDMY(e.date)}</span>
              </div>
            ))}
            {sorted.length > MAX_TOPIC_ROWS && (
              <div className="report-topic-more">+ {sorted.length - MAX_TOPIC_ROWS} más en este período</div>
            )}
          </div>
        )}
      </div>

      {teacherNote.trim() && (
        <div className="report-section">
          <div className="report-section-title">Nota del profesor</div>
          <p className="report-note">{teacherNote}</p>
        </div>
      )}

      {studyMaterial.trim() && (
        <div className="report-section">
          <div className="report-section-title">Para practicar en casa</div>
          <p className="report-note">{studyMaterial}</p>
        </div>
      )}

      <div className="report-footer">LET Junior · letjunior.com · Generado el {formatDateDMY(new Date().toISOString())}</div>
    </div>
  );
}
