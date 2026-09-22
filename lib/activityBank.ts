/**
 * The activity bank — reusable classroom formats, not topic-specific
 * content. A teacher picking "Past Simple" twenty minutes before a lesson
 * doesn't need a script for Past Simple; they need "run Hot Seat with it,
 * here are the four steps". So every activity is a *shape* that takes the
 * topic as its subject, and `steps(topic)` drops the real topic name into
 * the instructions.
 *
 * Deliberately a static module, not Firestore: these formats are the
 * teaching craft, they don't change week to week, and shipping them as
 * code means the topic sheet renders instantly with no second round trip.
 * If per-topic saved notes ever become a thing, they belong on the
 * curriculum level doc, not here.
 */

export type ActivityKind = "warmup" | "game" | "speaking" | "drill" | "creative";

export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  warmup: "Warm-up",
  game: "Game",
  speaking: "Speaking",
  drill: "Drill",
  creative: "Creative",
};

export interface Activity {
  id: string;
  name: string;
  emoji: string;
  kind: ActivityKind;
  minutes: number;
  /** "none" means you can start it with nothing but the topic in your head — the whole point of the 20-minutes-before-class flow. */
  prep: "none" | "light";
  ages: "7-10" | "11-14" | "all";
  blurb: string;
  steps: (topic: string) => string[];
  tip: string;
}

export const ACTIVITIES: Activity[] = [
  {
    id: "simon-says",
    name: "Simon Says",
    emoji: "🙋",
    kind: "warmup",
    minutes: 5,
    prep: "none",
    ages: "7-10",
    blurb: "Listening under pressure — they have to process the words before their body moves.",
    steps: (t) => [
      `Give five ${t} words or phrases and mime each one once.`,
      `Call "Simon says <${t} phrase>" — everyone mimes it.`,
      `Drop "Simon says" sometimes; whoever moves anyway is out for one round.`,
      `Hand the caller role to a student — now they have to produce the language, not just hear it.`,
    ],
    tip: "Speed up gradually. The fun is in the near-misses, not in eliminating people, so bring them back in.",
  },
  {
    id: "hot-seat",
    name: "Hot Seat",
    emoji: "🪑",
    kind: "speaking",
    minutes: 10,
    prep: "none",
    ages: "all",
    blurb: "One student can't see the word; the rest have to describe it without saying it.",
    steps: (t) => [
      `One student sits facing away from the screen or board.`,
      `Show everyone else a ${t} word.`,
      `They describe it in English — no translating, no saying the word itself.`,
      `The hot seat guesses. Swap after each word so everyone describes and guesses.`,
    ],
    tip: "Pre-teach three describing openers (\"It's a thing you…\", \"It's when…\", \"It's the opposite of…\") and the quiet ones will talk.",
  },
  {
    id: "board-race",
    name: "Board Race",
    emoji: "🏁",
    kind: "game",
    minutes: 8,
    prep: "none",
    ages: "all",
    blurb: "Two teams, one board, sixty seconds of recall.",
    steps: (t) => [
      `Split into two teams and draw a line down the board (or share two blank slides online).`,
      `Call out the ${t} category.`,
      `One player per team writes at a time, then passes the marker.`,
      `Sixty seconds. Count only correctly spelled, correctly used words.`,
    ],
    tip: "Reviewing the wrong answers together afterwards is where the actual learning lands — don't skip it.",
  },
  {
    id: "running-dictation",
    name: "Running Dictation",
    emoji: "🏃",
    kind: "drill",
    minutes: 12,
    prep: "light",
    ages: "all",
    blurb: "Reading, memory, speaking and writing in one loop. Loud, and worth it.",
    steps: (t) => [
      `Stick four short ${t} sentences on the far wall (or paste them in chat, one at a time).`,
      `In pairs: one runs and reads, comes back and dictates from memory; the other writes.`,
      `They swap roles every sentence.`,
      `First pair with all four sentences written correctly wins.`,
    ],
    tip: "Runners can't write and writers can't look. That rule is the whole activity — enforce it once and it holds.",
  },
  {
    id: "pictionary",
    name: "Pictionary",
    emoji: "✏️",
    kind: "game",
    minutes: 8,
    prep: "none",
    ages: "7-10",
    blurb: "Draw it, don't say it. Works online with any shared whiteboard.",
    steps: (t) => [
      `Send one student a ${t} word privately.`,
      `They draw it — no letters, no numbers, no speaking.`,
      `Everyone else guesses in full sentences, not single words: "Is it a…?"`,
      `The correct guesser draws next.`,
    ],
    tip: "Insisting on full-sentence guesses turns a drawing game into a speaking activity for free.",
  },
  {
    id: "charades",
    name: "Charades",
    emoji: "🎭",
    kind: "game",
    minutes: 8,
    prep: "none",
    ages: "7-10",
    blurb: "Same as Pictionary, with the body instead of a pen. Better for verbs and actions.",
    steps: (t) => [
      `Give one student a ${t} word or phrase to act out.`,
      `No sound, no pointing at objects in the room.`,
      `The class guesses aloud; keep a team score if you want the energy up.`,
      `Rotate so every student performs at least once.`,
    ],
    tip: "Go first yourself and be shameless. The class's willingness is capped by yours.",
  },
  {
    id: "twenty-questions",
    name: "Twenty Questions",
    emoji: "❓",
    kind: "speaking",
    minutes: 10,
    prep: "none",
    ages: "11-14",
    blurb: "Pure question-form practice, disguised as a guessing game.",
    steps: (t) => [
      `You think of something from the ${t} topic and don't say it.`,
      `They ask yes/no questions only — a malformed question costs them a turn.`,
      `Track the count out loud; twenty is the limit.`,
      `Whoever guesses it takes your place.`,
    ],
    tip: "Write the three question frames on the board first. This is where bad word order shows up, so correct it on the spot.",
  },
  {
    id: "would-you-rather",
    name: "Would You Rather",
    emoji: "🤔",
    kind: "speaking",
    minutes: 10,
    prep: "light",
    ages: "11-14",
    blurb: "Opinions and reasons — the fastest route to unscripted speaking.",
    steps: (t) => [
      `Write five "Would you rather…?" pairs using ${t} language.`,
      `Read one. Everyone physically picks a side of the room (or a reaction emoji online).`,
      `Each student gives one reason, starting with "I'd rather… because…".`,
      `Push back playfully on one answer per round to force a second sentence.`,
    ],
    tip: "The absurd options get better English than the sensible ones. Make the pairs ridiculous.",
  },
  {
    id: "roleplay",
    name: "Roleplay Scene",
    emoji: "🎬",
    kind: "speaking",
    minutes: 15,
    prep: "light",
    ages: "all",
    blurb: "A real situation where the topic is the only way to get what you want.",
    steps: (t) => [
      `Set a scene where ${t} is unavoidable — a shop, a doctor, an airport, a new friend.`,
      `Assign roles and one secret goal each ("get a discount", "don't admit you're lost").`,
      `Two minutes to prepare, no full script allowed — bullet points only.`,
      `Perform. The class listens for one thing you name in advance.`,
    ],
    tip: "Banning the full script is what makes it speaking rather than reading aloud. Bullet points only, every time.",
  },
  {
    id: "memory-chain",
    name: "Memory Chain",
    emoji: "🔗",
    kind: "drill",
    minutes: 6,
    prep: "none",
    ages: "7-10",
    blurb: "Each student repeats everything before them, then adds one. Brutal and beloved.",
    steps: (t) => [
      `Start: "In my bag I have… <${t} item>" — or any frame that fits the topic.`,
      `Each student repeats the whole chain, then adds their own.`,
      `A mistake restarts the chain from that student, not from zero.`,
      `See how far the class can get, and beat it next lesson.`,
    ],
    tip: "Keeping a class record on the board turns a repetition drill into something they ask for.",
  },
  {
    id: "bingo",
    name: "Bingo",
    emoji: "🎟️",
    kind: "drill",
    minutes: 8,
    prep: "light",
    ages: "7-10",
    blurb: "Quiet, focused listening practice when the energy needs to come down.",
    steps: (t) => [
      `Everyone draws a 3×3 grid and fills it with nine ${t} words from the board (their choice, so no two grids match).`,
      `Call words at random — in a definition, not as the bare word.`,
      `They cross off what they hear.`,
      `Three in a row shouts "Bingo!" and reads their line back to prove it.`,
    ],
    tip: "Calling the definition instead of the word is the upgrade that makes this worth class time.",
  },
  {
    id: "two-truths",
    name: "Two Truths and a Lie",
    emoji: "🕵️",
    kind: "speaking",
    minutes: 10,
    prep: "none",
    ages: "11-14",
    blurb: "Personal, so they actually want to speak — and want to listen.",
    steps: (t) => [
      `Each student writes three ${t} sentences about themselves: two true, one false.`,
      `They read all three with a straight face.`,
      `The class asks two follow-up questions before voting on the lie.`,
      `Reveal, then move on quickly — the follow-up questions are the real practice.`,
    ],
    tip: "Model it with your own three sentences first, and make your lie a good one.",
  },
  {
    id: "story-chain",
    name: "Story Chain",
    emoji: "📖",
    kind: "creative",
    minutes: 12,
    prep: "none",
    ages: "all",
    blurb: "One sentence each. The story gets stupid, the language gets used.",
    steps: (t) => [
      `You open with one sentence using ${t}.`,
      `Each student adds exactly one sentence that continues it and uses the topic.`,
      `No "and then he woke up" and no ending it early.`,
      `Go twice around, then have one student retell the whole thing.`,
    ],
    tip: "The final retell is the assessment. Listen for whether the topic language survived the lap.",
  },
  {
    id: "odd-one-out",
    name: "Odd One Out",
    emoji: "🧩",
    kind: "warmup",
    minutes: 5,
    prep: "light",
    ages: "all",
    blurb: "Three items, one doesn't belong — and they have to justify why.",
    steps: (t) => [
      `Show three ${t} items. One doesn't fit.`,
      `They say which, and why, in a full sentence.`,
      `Accept any answer they can justify — often there are two good ones.`,
      `Let a student build the next set.`,
    ],
    tip: "Rewarding the defensible wrong answer teaches them that reasoning in English beats guessing right.",
  },
  {
    id: "find-someone-who",
    name: "Find Someone Who",
    emoji: "🔍",
    kind: "speaking",
    minutes: 12,
    prep: "light",
    ages: "11-14",
    blurb: "Everyone asks everyone. Maximum talking time per minute of class.",
    steps: (t) => [
      `Write six "Find someone who…" prompts using ${t}.`,
      `They move around asking real questions — not reading the prompt aloud.`,
      `One name per prompt, and they must ask one follow-up before writing it down.`,
      `Report back: "I found out that Mila…".`,
    ],
    tip: "Converting the prompt into a real question is the skill. Drill that conversion once before they start.",
  },
  {
    id: "backs-to-board",
    name: "Backs to the Board",
    emoji: "🔙",
    kind: "game",
    minutes: 10,
    prep: "none",
    ages: "all",
    blurb: "Team Hot Seat. Competitive, noisy, and the whole class is producing at once.",
    steps: (t) => [
      `Two teams, one player from each sitting with their back to the board.`,
      `Write a ${t} word up. Both teams describe it to their own player simultaneously.`,
      `First player to say the word scores.`,
      `Swap the seated player every round.`,
    ],
    tip: "Works online too — the two guessers turn their cameras off and look away while you post the word.",
  },
];

/** Every activity that fits `kind` (or all of them), optionally narrowed to no-prep ones. */
export function filterActivities(kind: ActivityKind | "all", noPrepOnly: boolean): Activity[] {
  return ACTIVITIES.filter((a) => (kind === "all" || a.kind === kind) && (!noPrepOnly || a.prep === "none"));
}
