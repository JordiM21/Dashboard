"use client";

import { useMemo, useState } from "react";
import { playConfettiChime, playVictoryFanfare } from "@/lib/soundEffects";
import type { MatchWordImageData } from "@/lib/types";
import { shuffle } from "./gameTypes";

export default function MatchWordImagePlayer({ data }: { data: MatchWordImageData }) {
  const words = useMemo(() => shuffle(data.pairs), [data]);
  const images = useMemo(() => shuffle(data.pairs), [data]);

  const [armedId, setArmedId] = useState<string | null>(null);
  const [correct, setCorrect] = useState<Set<string>>(new Set());
  const [wrongId, setWrongId] = useState<string | null>(null);
  const [won, setWon] = useState(false);

  const total = data.pairs.length;
  const score = correct.size;

  function pickWord(id: string) {
    if (correct.has(id)) return;
    setArmedId((cur) => (cur === id ? null : id));
  }

  function pickImage(id: string) {
    if (correct.has(id) || !armedId) return;
    if (armedId === id) {
      const next = new Set(correct).add(id);
      setCorrect(next);
      setArmedId(null);
      void playConfettiChime();
      if (next.size === total) {
        setWon(true);
        void playVictoryFanfare();
      }
    } else {
      setWrongId(id);
      setArmedId(null);
      setTimeout(() => setWrongId(null), 300);
    }
  }

  return (
    <>
      <div className="game-play-score">
        ⭐ <span key={score} className="game-play-score-value">{score}</span> / {total}
      </div>
      {won && <div className="game-play-banner">🎉 All matched!</div>}
      <div className="match-columns">
        <div className="match-column">
          {words.map((p) => (
            <div
              key={p.id}
              className={`match-column-item${armedId === p.id ? " armed" : ""}${correct.has(p.id) ? " correct" : ""}`}
              onClick={() => pickWord(p.id)}
            >
              {p.word}
            </div>
          ))}
        </div>
        <div className="match-column">
          {images.map((p) => (
            <div
              key={p.id}
              className={`match-column-item${correct.has(p.id) ? " correct" : ""}${wrongId === p.id ? " wrong" : ""}`}
              onClick={() => pickImage(p.id)}
            >
              <img src={p.image} alt="" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
