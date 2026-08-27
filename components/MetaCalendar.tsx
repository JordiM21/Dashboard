"use client";

import type { ScheduledMetaPost } from "@/lib/types";
import { localDateIso } from "@/lib/dateUtils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface CalendarCell {
  date: Date;
  iso: string;
  inMonth: boolean;
}

function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const firstOfMonth = new Date(year, month, 1);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7; // 0 = Monday
  const gridStart = new Date(year, month, 1 - mondayOffset);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    return { date, iso: localDateIso(date), inMonth: date.getMonth() === month };
  });
}

export default function MetaCalendar({
  year,
  month,
  posts,
  onDayClick,
  onPostClick,
}: {
  year: number;
  month: number; // 0-indexed
  posts: ScheduledMetaPost[];
  onDayClick: (iso: string) => void;
  onPostClick: (post: ScheduledMetaPost) => void;
}) {
  const cells = buildMonthGrid(year, month);
  const todayIso = localDateIso();

  const postsByDay = new Map<string, ScheduledMetaPost[]>();
  for (const p of posts) {
    const day = p.scheduledFor.slice(0, 10);
    postsByDay.set(day, [...(postsByDay.get(day) ?? []), p]);
  }

  return (
    <div className="meta-calendar-grid">
      {WEEKDAYS.map((w) => (
        <div key={w} className="meta-calendar-weekday">
          {w}
        </div>
      ))}
      {cells.map((cell) => {
        const dayPosts = (postsByDay.get(cell.iso) ?? []).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
        const classes = [
          "meta-calendar-cell",
          !cell.inMonth && "meta-calendar-cell-outside",
          cell.iso === todayIso && "meta-calendar-cell-today",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div key={cell.iso} className={classes} onClick={() => onDayClick(cell.iso)}>
            <div className="meta-calendar-date">{cell.date.getDate()}</div>
            {dayPosts.map((p) => {
              const time = new Date(p.scheduledFor).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              });
              const postClasses = [
                "meta-calendar-post",
                p.status === "failed" ? "meta-calendar-post-failed" : `meta-calendar-post-${p.platform === "both" ? "facebook" : p.platform}`,
                p.status === "published" && "meta-calendar-post-published",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <div
                  key={p.id}
                  className={postClasses}
                  title={p.caption}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPostClick(p);
                  }}
                >
                  {time} · {p.caption || "(no caption)"}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
