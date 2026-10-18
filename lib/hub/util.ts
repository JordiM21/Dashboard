import { addDays, formatDateDMY, localDateIso } from "@/lib/dateUtils";

export { addDays, formatDateDMY, localDateIso };

export const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));
/**
 * Local wall-clock timestamp without a zone ("2026-10-18T21:05:00.000").
 * Every v2 timestamp uses this so .slice(0, 10) is always the local day —
 * a UTC ISO string would file an evening completion under tomorrow.
 */
export function localIso(d: Date = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
export const nowIso = () => localIso();
export const today = () => localDateIso();

/** Monday of the week containing iso. */
export function weekStart(iso: string = today()): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

export function dayOfWeek(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export const monthKey = (iso: string = today()) => iso.slice(0, 7);

export function prevMonth(key: string, n = 1): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const monthName = (key: string) => MONTHS[Number(key.slice(5, 7)) - 1];
export const dayName = (iso: string) => DAYS[dayOfWeek(iso)];

/** "Today", "Tomorrow", "Yesterday", weekday within ±6 days, else DD-MM-YYYY. */
export function relDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = daysBetween(today(), iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return dayName(iso);
  return formatDateDMY(iso);
}

export const money = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const minutesLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`);

export const hhmm = (d: Date = new Date()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
