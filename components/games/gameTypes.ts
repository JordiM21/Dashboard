import type { GameDoc, GameType } from "@/lib/types";

export const GAME_TYPES: { type: GameType; icon: string; label: string; desc: string }[] = [
  { type: "memory-cards", icon: "🧠", label: "Memory Cards", desc: "Flip cards to find matching pairs." },
  { type: "fill-in-the-gaps", icon: "✏️", label: "Fill in the Gaps", desc: "Drag words into blank sentences." },
  { type: "match-word-image", icon: "🔗", label: "Match Word ↔ Image", desc: "Match each word to its picture." },
  { type: "hangman", icon: "🪢", label: "Hangman", desc: "Guess the word letter by letter." },
  { type: "sort-categories", icon: "🗂️", label: "Sort into Categories", desc: "Drag each item into the right bin." },
  { type: "spelling-bee", icon: "🐝", label: "Spelling Bee", desc: "Hear the word, spell it letter by letter." },
];

export function gameTypeMeta(type: GameType) {
  return GAME_TYPES.find((g) => g.type === type) ?? GAME_TYPES[0];
}

/** Fisher-Yates — used to shuffle memory cards, word banks, and match columns at play time. */
export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** One seeded empty row per type, so a freshly-created game's editor never opens blank. */
export function seedGameData(
  type: GameType
): Pick<GameDoc, "memoryCards" | "fillGaps" | "matchWordImage" | "hangman" | "sortCategories" | "spellingBee"> {
  switch (type) {
    case "memory-cards":
      return { memoryCards: { items: [{ id: crypto.randomUUID(), kind: "text", value: "" }] } };
    case "fill-in-the-gaps":
      return { fillGaps: { sentences: [{ id: crypto.randomUUID(), text: "The cat ___ on the mat.", answer: "sat" }] } };
    case "match-word-image":
      return { matchWordImage: { pairs: [{ id: crypto.randomUUID(), word: "", image: "" }] } };
    case "hangman":
      return { hangman: { words: [{ id: crypto.randomUUID(), word: "", hint: "" }] } };
    case "sort-categories": {
      const catA = { id: crypto.randomUUID(), name: "Category A" };
      const catB = { id: crypto.randomUUID(), name: "Category B" };
      return {
        sortCategories: {
          categories: [catA, catB],
          items: [{ id: crypto.randomUUID(), kind: "text", value: "", categoryId: catA.id }],
        },
      };
    }
    case "spelling-bee":
      return { spellingBee: { words: [{ id: crypto.randomUUID(), word: "", hint: "" }] } };
  }
}
