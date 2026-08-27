/** Shared date helpers for "YYYY-MM-DD" ISO date strings — used anywhere a fixed monthly schedule (recurring payments, student due dates) needs to advance without drifting based on when it actually ran. */

/** Local calendar date (not UTC) as "YYYY-MM-DD" — matches how <input type="date"> values are entered/stored. */
export function localDateIso(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** iso + n calendar months, clamped to the target month's last day (Jan 31 + 1 -> Feb 28/29, not Mar 3). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1 + months, 1); // first of the target month
  const lastDayOfTargetMonth = new Date(y, m + months, 0).getDate();
  target.setDate(Math.min(d, lastDayOfTargetMonth));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

/** iso + 1 calendar month — the fixed cadence used for student due dates (see lib/studentStatus.ts). */
export function addOneMonth(iso: string): string {
  return addMonths(iso, 1);
}

/** "YYYY-MM-DD" -> "DD-MM-YYYY" for display — every date shown as text in this app uses this one format, consistently. Never use this on an <input type="date">'s value; those must stay native ISO for the browser's date picker to work. */
export function formatDateDMY(iso: string | undefined | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}-${m}-${y}`;
}

/** iso + n days. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(y, m - 1, d + n);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}
