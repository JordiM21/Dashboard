import { NextRequest, NextResponse } from "next/server";
import { listGames, createGame } from "@/lib/firebase/db";
import { requireAuth } from "@/lib/firebase/verifyAuth";
import type { GameDoc } from "@/lib/types";

export async function GET() {
  const games = await listGames();
  return NextResponse.json(games);
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (err) {
    return NextResponse.json(
      { error: "unauthorized", message: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json();
  const { frontmatter } = body as { frontmatter: Partial<GameDoc> };
  if (!frontmatter?.title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!frontmatter?.type) {
    return NextResponse.json({ error: "type is required" }, { status: 400 });
  }

  // Only the one field matching `type` is ever set — Firestore's admin SDK
  // rejects `undefined` field values outright, so the other type-data
  // fields must be omitted entirely rather than passed as undefined.
  const game = await createGame({
    type: frontmatter.type,
    title: frontmatter.title,
    description: frontmatter.description ?? "",
    tags: frontmatter.tags ?? [],
    cover: frontmatter.cover || "/covers/placeholder.svg",
    ...(frontmatter.memoryCards ? { memoryCards: frontmatter.memoryCards } : {}),
    ...(frontmatter.fillGaps ? { fillGaps: frontmatter.fillGaps } : {}),
    ...(frontmatter.matchWordImage ? { matchWordImage: frontmatter.matchWordImage } : {}),
    ...(frontmatter.hangman ? { hangman: frontmatter.hangman } : {}),
    ...(frontmatter.sortCategories ? { sortCategories: frontmatter.sortCategories } : {}),
    ...(frontmatter.spellingBee ? { spellingBee: frontmatter.spellingBee } : {}),
  });
  return NextResponse.json(game, { status: 201 });
}
