/**
 * Demo stand-ins for the live Firestore collections, used when nobody is
 * signed in (local preview). Shapes match lib/types.ts exactly so every
 * screen runs the same code path in demo and live mode.
 */
import type { CurriculumLevelDoc, FinanceEntry, GroupDoc, RecurringTransaction, ResourceFile, ResourceFolder, Student, WeeklyPlanDoc } from "@/lib/types";
import { addDays, addMonths, localDateIso } from "@/lib/dateUtils";

const T = localDateIso();
const LEVELS: [string, string[]][] = [
  ["Hello World!", ["Greetings", "Numbers 1-20", "Colors and Objects", "Verb To Be"]],
  ["My Universe", ["Prepositions of Place (in/on/under)", "Animals + Colors", "Common Objects", "Demonstratives (This/That/These/Those)"]],
  ["Action Time!", ["Action Verbs", "Modals Can/Can't", "Basic Questions", "Do you like? Don't"]],
  ["Daily Life", ["Food and Drinks", "Clothes & Accessories", "Ingredients", "Meals & Ordering"]],
  ["The Third Person", ["Describing friends and family", "Describe Activities", "He/She/It Spelling Rules", "Does/Doesn't Questions"]],
  ["Right Now", ["Present Continuous", "Questions with -ing", "Describe actions", "Present Simple vs. Continuous"]],
  ["My Day", ["Daily routines", "The Time", "Days of the Week", "Months of the year"]],
  ["City Explorer", ["Places in the city", "Ask/Give Directions", "How can I go..?", "Transport in English"]],
  ["How Much?", ["Uncountable/Countable", "Money Talk", "Shopping Mall", "There are/is"]],
  ["Rule Maker", ["School rules", "Home Chores", "Must/Mustn't (Obligations)", "Should/Shouldn't (Advice)"]],
  ["The Time Machine", ["Intro to Past Simple", "Regular/Irregular Verbs", "Story Practice", "Talking Past Experiences"]],
  ["Yesterday's Adventures", ["Past To Be (Was/Were)", "Past/Present -ing", "Past Continuous (was/were + -ing)", "Interrupting Actions (When/While)"]],
  ["The Rule Breakers", ["Irregular past tense verbs", "Compare Past - Present", "Used To (past habits)", "Did/Didn't Questions"]],
  ["Future Vision", ["Plans and intentions", "Future with Will", "Future with Going To", "When I Grow Up"]],
  ["World Discoveries", ["Geography Vocabulary", "Prepositions of Movement", "Intro to Passive Voice"]],
  ["Life Experiences", ["Intro to Present Perfect", "I have (-ed verb)", "Questions in P. Perfect", "Ever/Never/Yet/Already"]],
  ["If This, Then That", ["1st Conditional (IF)", "Condition/Result", "Bargains using if", "2nd Conditional (Imaginary)"]],
  ["The Record Book", ["Superlatives", "Comparatives", "Possessive Pronouns", "Possessive Adjectives"]],
  ["Opinion Maker", ["Expressing Agree/Don't", "Explain Reasoning", "Contradict Opinions", "Conjunctions (Because/Although/However)"]],
  ["The Storyteller", ["Combine Tenses (Stories)", "Start - Middle - End", "Review and Identify Parts", "Adverbs of Manner (quickly, well)"]],
  ["The Expert", ["Relative Clauses (Who/Which/That)", "Reported Speech", "Passive Voice (Past/Present)", "Phrasal Verbs"]],
];
const STAGES = ["Foundation", "Expansion", "Narrative", "Mastery"];

export const demoCurriculum: CurriculumLevelDoc[] = LEVELS.map(([title, subtopics], i) => ({
  id: `level-${i + 1}`,
  levelNumber: i + 1,
  stageName: STAGES[Math.min(3, Math.floor(i / 5))],
  title,
  subtopics,
  emoji: "",
  color: null,
}));

export const demoGroups: GroupDoc[] = [
  { id: "g-a", name: "Group A", currentLevel: 6, currentTopic: "Questions with -ing" },
  { id: "g-b", name: "Group B", currentLevel: 3, currentTopic: "Basic Questions" },
  { id: "g-c", name: "Group C", currentLevel: 11, currentTopic: "Regular/Irregular Verbs" },
  { id: "g-d", name: "Group D", currentLevel: 1, currentTopic: "Colors and Objects" },
];

const S: [string, string, number, number, string][] = [
  // name, group, tuition, due offset (days from today), parent email
  ["Valentina Ruiz", "Group A", 50, 12, "ruiz.family@example.com"],
  ["Mateo Fernández", "Group A", 50, -9, "mfernandez@example.com"],
  ["Sofía Herrera", "Group A", 50, 2, "herrera.s@example.com"],
  ["Lucas Moreno", "Group A", 40, 20, "lmoreno@example.com"],
  ["Isabella Castro", "Group B", 50, 1, "castro.home@example.com"],
  ["Thiago Vargas", "Group B", 50, 15, "vargas.t@example.com"],
  ["Emilia Rojas", "Group B", 60, -3, "rojas.e@example.com"],
  ["Santiago López", "Group C", 50, 25, "slopez@example.com"],
  ["Camila Torres", "Group C", 50, 8, "torres.c@example.com"],
  ["Benjamín Díaz", "Group C", 50, 18, "bdiaz@example.com"],
  ["Martina Silva", "Group D", 50, 5, "silva.m@example.com"],
  ["Joaquín Mendoza", "Group D", 50, 27, "mendoza.j@example.com"],
];

export const demoStudents: Student[] = [
  ...S.map(([name, classGroup, tuition, due, parentEmail], i) => ({
    id: `s-${i + 1}`,
    name,
    status: "active" as const,
    classGroup,
    tuition,
    nextPayment: addDays(T, due),
    parentEmail,
    plan: "Main Course" as const,
    schedule: "",
    notes: i === 1 ? "Parent prefers WhatsApp over email." : "",
    createdAt: addMonths(T, -(i % 7) - 1) + "T12:00:00.000Z",
  })),
  { id: "s-13", name: "Gabriel Núñez", status: "inactive", classGroup: "", tuition: 50, plan: "Main Course", parentEmail: "nunez@example.com", createdAt: addMonths(T, -8) + "T12:00:00.000Z" },
  { id: "s-14", name: "Renata Aguilar", status: "inactive", classGroup: "", tuition: 0, plan: "Initial Demo", parentEmail: "aguilar.r@example.com", createdAt: addDays(T, -6) + "T12:00:00.000Z" },
];

export const demoTransactions: FinanceEntry[] = (() => {
  const out: FinanceEntry[] = [];
  let n = 0;
  for (let m = 5; m >= 0; m--) {
    const active = demoStudents.filter((s) => s.status === "active" && (s.createdAt ?? "") <= addMonths(T, -m) + "T23");
    for (const s of active) {
      const date = addMonths(addDays(T, -((n * 7) % 26)), -m);
      if (date > T) continue;
      out.push({ id: `t-${++n}`, date, description: `Monthly tuition · ${s.name}`, category: "Tuition", type: "Income", amount: s.tuition ?? 50, source: "stripe", studentId: s.id, payerEmail: s.parentEmail, studentApplied: true });
    }
    const first = addMonths(T.slice(0, 8) + "02", -m);
    out.push({ id: `t-${++n}`, date: first, description: "Meta ads", category: "Ads", type: "Expense", amount: -(90 + m * 10), source: "recurring" });
    out.push({ id: `t-${++n}`, date: addDays(first, 3), description: "Zoom Pro", category: "Software", type: "Expense", amount: -15.99, source: "recurring" });
    out.push({ id: `t-${++n}`, date: addDays(first, 8), description: "Canva", category: "Software", type: "Expense", amount: -14.99, source: "recurring" });
    if (m % 2 === 0) out.push({ id: `t-${++n}`, date: addDays(first, 12), description: "Printed flashcards", category: "Materials", type: "Expense", amount: -22, source: "manual" });
  }
  out.push({ id: `t-${++n}`, date: addDays(T, -1), description: "Payment · COP", category: "Tuition", type: "Income", amount: 48.6, originalAmount: 200000, originalCurrency: "cop", exchangeRate: 0.000243, source: "stripe", payerEmail: "unknown.parent@example.com", studentId: null });
  return out.filter((t) => t.date <= T).sort((a, b) => (a.date < b.date ? 1 : -1));
})();

export const demoRecurring: RecurringTransaction[] = [
  { id: "r-1", description: "Meta ads", category: "Ads", type: "Expense", amount: 90, active: true, lastPayment: null, nextPayment: addMonths(T.slice(0, 8) + "02", 1), frequencyMonths: 1 },
  { id: "r-2", description: "Zoom Pro", category: "Software", type: "Expense", amount: 15.99, active: true, lastPayment: null, nextPayment: addMonths(T.slice(0, 8) + "05", 1), frequencyMonths: 1 },
  { id: "r-3", description: "Canva", category: "Software", type: "Expense", amount: 14.99, active: true, lastPayment: null, nextPayment: addMonths(T.slice(0, 8) + "10", 1), frequencyMonths: 1 },
];

export const demoPlans: WeeklyPlanDoc[] = demoGroups.flatMap((g, gi) =>
  [14, 7, 3].map((ago, i) => ({
    id: `wp-${g.id}-${i}`,
    groupId: g.id,
    date: addDays(T, -ago - gi),
    topic: demoCurriculum[g.currentLevel - 1].subtopics[Math.max(0, i - 1)],
    teacherNotes: "",
    takeaways: i === 2 ? "Good energy, review vocabulary next class." : "",
    links: [],
    historyEntryId: "h",
    emojis: [],
    tagIds: [],
  }))
);

export const demoFolders: ResourceFolder[] = [
  { id: "f-1", name: "Flashcards", parentId: null, createdAt: T },
  { id: "f-2", name: "Worksheets", parentId: null, createdAt: T },
  { id: "f-3", name: "Games & Warm-ups", parentId: null, createdAt: T },
  { id: "f-4", name: "Parent templates", parentId: null, createdAt: T },
];

const file = (id: string, title: string, folderId: string, tags: string[], mimeType = "application/pdf"): ResourceFile => ({
  id, title, description: "", tags, folderId, originalName: title + ".pdf", storagePath: "", mimeType, size: 240000, createdAt: T, updatedAt: T,
});

export const demoFiles: ResourceFile[] = [
  file("rf-1", "Present Continuous flashcards", "f-1", ["Present Continuous", "Right Now"]),
  file("rf-2", "Animals + Colors cards", "f-1", ["Animals + Colors"]),
  file("rf-3", "Basic Questions worksheet", "f-2", ["Basic Questions"]),
  file("rf-4", "Past Simple story builder", "f-2", ["Intro to Past Simple", "Regular/Irregular Verbs"]),
  file("rf-5", "Colors and Objects bingo", "f-3", ["Colors and Objects"], "image/png"),
  file("rf-6", "Questions with -ing guessing game", "f-3", ["Questions with -ing"]),
  file("rf-7", "Monthly feedback template", "f-4", ["feedback"]),
];
