"use client";

import { useEffect, useState } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import ViewToggle from "@/components/ViewToggle";
import ResourcesBrowser from "@/components/ResourcesBrowser";
import GroupsHub from "@/components/classroom/GroupsHub";

/**
 * The Classroom — what used to be the Students view, the Teaching view, and
 * a standalone Curriculum tab, now one place. Groups is the home: a class,
 * where it is in the syllabus, who's in it, and every lesson planned or
 * taught. Its rail's "All Students" entry folds in the full searchable
 * roster (used to be its own tab showing the same people from a shallower
 * angle), and each group's own panel carries a compact, expand-on-click
 * curriculum picker — where they are, where to send them next, and a
 * "+" to plan that lesson, without a trip to a separate Curriculum tab.
 * The full syllabus board (multi-group assignment, add/rename/reorder
 * levels) still exists — GroupsHub opens it in a modal on demand, since
 * that's a rarer, structural job, not the daily lesson-planning one.
 * Resources is the file library.
 *
 * The embedded Excalidraw whiteboard that used to live under Teaching is
 * gone — boards are local .excalidraw files now, linked onto a lesson like
 * any other material.
 */
const SECTIONS = [
  { value: "groups", label: "Groups" },
  { value: "resources", label: "Resources" },
] as const;

type Section = (typeof SECTIONS)[number]["value"];

const SUBTITLE: Record<Section, string> = {
  groups: "Every class and every student — where they are, and where to send them next",
  resources: "Files, images, video and notes you teach from",
};

const STORAGE_KEY = "classroom-section";

export default function ClassroomPage() {
  const [section, setSection] = useState<Section>("groups");

  // Come back to the tab you were last on — re-picking yours on every
  // visit is friction.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SECTIONS.some((s) => s.value === stored)) setSection(stored as Section);
  }, []);

  function pick(next: Section) {
    setSection(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Classroom</div>
          <div className="page-subtitle">{SUBTITLE[section]}</div>
        </div>
        <ViewToggle value={section} onChange={pick} options={SECTIONS as unknown as { value: Section; label: string }[]} />
      </div>

      <div key={section} className="section-swap">
        {section === "groups" && (
          <ErrorBoundary label="the groups view">
            <GroupsHub />
          </ErrorBoundary>
        )}
        {section === "resources" && (
          <ErrorBoundary label="Resources">
            <ResourcesBrowser />
          </ErrorBoundary>
        )}
      </div>
    </main>
  );
}
