"use client";

import { useEffect, useState } from "react";
import { playConfettiChime, playVictoryFanfare } from "@/lib/soundEffects";
import type { FillGapsData } from "@/lib/types";
import { shuffle } from "./gameTypes";

interface Chip {
  chipId: string;
  value: string;
}

export default function FillGapsPlayer({ data }: { data: FillGapsData }) {
  const [bank, setBank] = useState<Chip[]>(() =>
    shuffle(data.sentences.map((s) => ({ chipId: crypto.randomUUID(), value: s.answer })))
  );
  const [filled, setFilled] = useState<Record<string, Chip>>({});
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [won, setWon] = useState(false);

  const total = data.sentences.length;
  const score = Object.keys(filled).length;

  useEffect(() => {
    if (total > 0 && score === total && !won) {
      setWon(true);
      void playVictoryFanfare();
    }
  }, [score, total, won]);

  function attemptDrop(sentenceId: string, answer: string) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverId(null);
      if (filled[sentenceId]) return;
      const chipId = e.dataTransfer.getData("text/plain");
      const chip = bank.find((c) => c.chipId === chipId);
      if (!chip) return;
      if (chip.value.trim().toLowerCase() !== answer.trim().toLowerCase()) return;

      setFilled((prev) => ({ ...prev, [sentenceId]: chip }));
      setBank((prev) => prev.filter((c) => c.chipId !== chipId));
      void playConfettiChime();
    };
  }

  return (
    <>
      <div className="game-play-score">
        ⭐ <span key={score} className="game-play-score-value">{score}</span> / {total}
      </div>
      {won && <div className="game-play-banner">🎉 All sentences complete!</div>}

      {data.sentences.map((s) => {
        const blankIdx = s.text.indexOf("___");
        const before = blankIdx >= 0 ? s.text.slice(0, blankIdx) : s.text;
        const after = blankIdx >= 0 ? s.text.slice(blankIdx + 3) : "";
        const fill = filled[s.id];
        return (
          <div className="fill-gap-sentence" key={s.id}>
            {before}
            <span
              className={`fill-gap-blank${fill ? " fill-gap-blank-filled" : ""}${
                dragOverId === s.id ? " fill-gap-blank-over" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                if (!fill) setDragOverId(s.id);
              }}
              onDragLeave={() => setDragOverId((id) => (id === s.id ? null : id))}
              onDrop={attemptDrop(s.id, s.answer)}
            >
              {fill ? fill.value : "…"}
            </span>
            {after}
          </div>
        );
      })}

      <div className="word-bank">
        {bank.map((chip) => (
          <div
            key={chip.chipId}
            className="word-bank-chip"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", chip.chipId);
              e.dataTransfer.effectAllowed = "move";
              e.currentTarget.classList.add("dragging");
            }}
            onDragEnd={(e) => e.currentTarget.classList.remove("dragging")}
          >
            {chip.value}
          </div>
        ))}
      </div>
    </>
  );
}
