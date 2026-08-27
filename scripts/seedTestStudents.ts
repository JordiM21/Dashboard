/**
 * One-time seed: adds a handful of test students spanning both plans and
 * all three payment statuses (Up to Date / Pending / Late), so the new
 * due-date/status system has something real to show. Safe to run more than
 * once — skips any student whose name already exists.
 *
 * Run from the project root:
 *   npx tsx scripts/seedTestStudents.ts
 */

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { getAdminDb } from "../lib/firebase/admin";
import { addDays, localDateIso } from "../lib/dateUtils";

const today = localDateIso();

const TEST_STUDENTS = [
  {
    name: "Ana Torres",
    contact: "ana.torres@example.com",
    status: "active" as const,
    plan: "Main Course" as const,
    classGroup: "B2 Evening",
    tuition: 120,
    nextPayment: addDays(today, 12), // in the future -> Up to Date
    parentEmail: "torres.family@example.com",
    parentConnected: true,
    tags: ["adult"],
  },
  {
    name: "Marco Diaz",
    contact: "marco.diaz@example.com",
    status: "active" as const,
    plan: "Main Course" as const,
    classGroup: "B1 Morning",
    tuition: 100,
    nextPayment: addDays(today, -3), // 3 days overdue, within the 5-day grace -> Pending
    parentEmail: "diaz.family@example.com",
    parentConnected: true,
    tags: [],
  },
  {
    name: "Sofia Reyes",
    contact: "sofia.reyes@example.com",
    status: "active" as const,
    plan: "Initial Demo" as const,
    classGroup: "A1 Trial",
    tuition: 0,
    nextPayment: addDays(today, -15), // well past the grace window -> Late
    parentEmail: "reyes.family@example.com",
    parentConnected: false,
    tags: ["trial"],
  },
  {
    name: "Leo Martinez",
    contact: "leo.martinez@example.com",
    status: "active" as const,
    plan: "Initial Demo" as const,
    classGroup: "A1 Trial",
    tuition: 0,
    nextPayment: addDays(today, 0), // due today -> still Up to Date (today <= due date)
    parentEmail: "martinez.family@example.com",
    parentConnected: true,
    tags: ["trial"],
  },
];

async function main() {
  const db = getAdminDb();
  const students = db.collection("students");

  let created = 0;
  let skipped = 0;

  for (const s of TEST_STUDENTS) {
    const existing = await students.where("name", "==", s.name).limit(1).get();
    if (!existing.empty) {
      console.log(`Skipping "${s.name}" — already exists.`);
      skipped++;
      continue;
    }

    const now = new Date().toISOString();
    await students.add({ ...s, createdAt: now, updatedAt: now });
    console.log(`Created "${s.name}" (${s.plan}, due ${s.nextPayment}).`);
    created++;
  }

  console.log(`\nDone. ${created} created, ${skipped} already existed.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
