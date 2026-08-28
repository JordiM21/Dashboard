"use client";

import { useMemo, useState } from "react";
import { playConfettiChime, playVictoryFanfare } from "@/lib/soundEffects";
import type { MemoryCardsData } from "@/lib/types";
import { shuffle } from "./gameTypes";

interface Card {
  uid: string;
  itemId: string;
  kind: "text" | "image";
  value: string;
  displayNumber: number;
}

export default function MemoryCardsPlayer({ data }: { data: MemoryCardsData }) {
  const cards = useMemo<Card[]>(
    () =>
      shuffle(
        data.items.flatMap((item) => [
          { uid: `${item.id}-a`, itemId: item.id, kind: item.kind, value: item.value },
          { uid: `${item.id}-b`, itemId: item.id, kind: item.kind, value: item.value },
        ])
      // Numbered in final (shuffled) grid order — a teacher screen-sharing
      // this can just say "open card 3" and a student reads it straight off
      // the card back, matching left-to-right reading order of the grid.
      ).map((card, i) => ({ ...card, displayNumber: i + 1 })),
    [data]
  );

  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [won, setWon] = useState(false);

  const totalPairs = data.items.length;

  function flip(card: Card) {
    if (busy || won) return;
    if (revealed.has(card.uid) || matched.has(card.itemId) || selected.length === 2) return;

    const nextSelected = [...selected, card.uid];
    setRevealed((prev) => new Set(prev).add(card.uid));
    setSelected(nextSelected);
    if (nextSelected.length < 2) return;

    const [firstUid, secondUid] = nextSelected;
    const first = cards.find((c) => c.uid === firstUid)!;
    const second = cards.find((c) => c.uid === secondUid)!;
    setBusy(true);

    if (first.itemId === second.itemId) {
      void playConfettiChime();
      setTimeout(() => {
        setMatched((prev) => {
          const next = new Set(prev).add(first.itemId);
          if (next.size === totalPairs) {
            setWon(true);
            void playVictoryFanfare();
          }
          return next;
        });
        setScore((s) => s + 1);
        setSelected([]);
        setBusy(false);
      }, 400);
    } else {
      setTimeout(() => {
        setRevealed((prev) => {
          const next = new Set(prev);
          next.delete(firstUid);
          next.delete(secondUid);
          return next;
        });
        setSelected([]);
        setBusy(false);
      }, 900);
    }
  }

  return (
    <>
      <div className="game-play-score">
        ⭐ <span key={score} className="game-play-score-value">{score}</span> / {totalPairs}
      </div>
      {won && <div className="game-play-banner">🎉 All pairs matched!</div>}
      <div className="memory-grid">
        {cards.map((card) => {
          const isRevealed = revealed.has(card.uid) || matched.has(card.itemId);
          return (
            <div
              key={card.uid}
              className={`memory-card${isRevealed ? " flipped" : ""}${matched.has(card.itemId) ? " matched" : ""}`}
              onClick={() => flip(card)}
            >
              <div className="memory-card-inner">
                <div className="memory-card-face memory-card-back">{card.displayNumber}</div>
                <div className="memory-card-face memory-card-front">
                  {card.kind === "image" ? <img src={card.value} alt="" /> : card.value}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
