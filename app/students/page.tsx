"use client";

import { useEffect, useState } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import ViewToggle from "@/components/ViewToggle";
import CurriculumBoard from "@/components/CurriculumBoard";
import ResourcesBrowser from "@/components/ResourcesBrowser";
import GroupsHub from "@/components/classroom/GroupsHub";
import StudentsRoster from "@/components/classroom/StudentsRoster";

/**
 * The Classroom — what used to be the Students view and the Teaching view,
 * now one place. Groups is the home: a class, where it is in the syllabus,
 * who's in it, and every lesson planned or taught. Curriculum plans ahead,
 * Students is the roster, Resources is the library.
 *
 * The embedded Excalidraw whiteboard that used to live under Teaching is
 * gone — boards are local .excalidraw files now, linked onto a lesson like
 * any other material.
 */
const SECTIONS = [
  { value: "groups", label: "Groups" },
  { value: "curriculum", label: "Curriculum" },
  { value: "students", label: "Students" },
  { value: "resources", label: "Resources" },
] as const;

type Section = (typeof SECTIONS)[number]["value"];

const SUBTITLE: Record<Section, string> = {
  groups: "Every class, where they are, and what you taught them",
  curriculum: "The syllabus — plan ahead and move a group along it",
  students: "Live roster, backed by Firestore",
  resources: "Files, images, video and notes you teach from",
};

const STORAGE_KEY = "classroom-section";

export default function ClassroomPage() {
  const [section, setSection] = useState<Section>("groups");

  // Come back to the tab you were last on — this view is four quite
  // different jobs, and re-picking yours on every visit is friction.
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
        {section === "curriculum" && (
          <ErrorBoundary label="the curriculum board">
            <CurriculumBoard />
          </ErrorBoundary>
        )}
        {section === "students" && <StudentsRoster />}
        {section === "resources" && (
          <ErrorBoundary label="Resources">
            <ResourcesBrowser />
          </ErrorBoundary>
        )}
      </div>
    </main>
  );
}
