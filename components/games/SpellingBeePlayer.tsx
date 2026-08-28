"use client";

import { useEffect, useMemo, useState } from "react";
import { playVictoryFanfare } from "@/lib/soundEffects";
import type { SpellingBeeData } from "@/lib/types";
import { shuffle } from "./gameTypes";

interface Tile {
  tileId: string;
  letter: string;
}

export default function SpellingBeePlayer({ data }: { data: SpellingBeeData }) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<Tile[]>([]);
  const [wrongShake, setWrongShake] = useState(false);
  const [solvedCount, setSolvedCount] = useState(0);
  const [solved, setSolved] = useState(false);

  const current = data.words[index];
  const word = current?.word.toUpperCase() ?? "";

  // Reshuffled only when the word itself changes (not on every keystroke of
  // `answer`) — keyed off the word's id rather than `word` so switching to a
  // different word with coincidentally-identical letters still re-shuffles.
  const tiles = useMemo<Tile[]>(() => shuffle([...word].map((letter, i) => ({ tileId: `${i}-${letter}`, letter }))), [current?.id]);

  useEffect(() => {
    if (answer.length === 0 || answer.length !== word.length) return;
    const attempt = answer.map((t) => t.letter).join("");
    if (attempt === word) {
      setSolved(true);
      setSolvedCount((c) => c + 1);
      void playVictoryFanfare();
    } else {
      setWrongShake(true);
      setTimeout(() => {
        setAnswer([]);
        setWrongShake(false);
      }, 500);
    }
  }, [answer, word]);

  function playAudio() {
    if (current?.audioUrl) void new Audio(current.audioUrl).play();
  }

  function pick(tile: Tile) {
    if (solved) return;
    setAnswer((prev) => [...prev, tile]);
  }

  function removeLast() {
    setAnswer((prev) => prev.slice(0, -1));
  }

  function nextWord() {
    setIndex((i) => (i + 1) % data.words.length);
    setAnswer([]);
    setSolved(false);
  }

  if (!current) {
    return <div className="game-play-banner">No words in this game yet — add some in the editor.</div>;
  }

  const usedTileIds = new Set(answer.map((t) => t.tileId));
  const pool = tiles.filter((t) => !usedTileIds.has(t.tileId));

  return (
    <>
      <div className="game-play-score">
        ⭐ <span key={solvedCount} className="game-play-score-value">{solvedCount}</span> / {data.words.length}
      </div>

      {current.hint && (
        <div style={{ textAlign: "center", color: "var(--ink-soft)", marginBottom: 8 }}>Hint: {current.hint}</div>
      )}

      {current.audioUrl && (
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={playAudio}>
            🔊 Play word
          </button>
        </div>
      )}

      <div className={`spelling-answer${wrongShake ? " spelling-answer-wrong" : ""}`}>
        {Array.from({ length: word.length }).map((_, i) => (
          <span key={i} className={`spelling-slot${answer[i] ? " filled" : ""}`}>
            {answer[i]?.letter ?? ""}
          </span>
        ))}
      </div>

      {solved && <div className="game-play-banner">🎉 Correct!</div>}

      {solved ? (
        <div style={{ textAlign: "center" }}>
          <button type="button" className="btn btn-primary" onClick={nextWord}>
            Next word →
          </button>
        </div>
      ) : (
        <>
          <div className="spelling-tiles">
            {pool.map((tile) => (
              <button key={tile.tileId} type="button" className="spelling-tile" onClick={() => pick(tile)}>
                {tile.letter}
              </button>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={removeLast} disabled={answer.length === 0}>
              ⌫ Backspace
            </button>
          </div>
        </>
      )}
    </>
  );
}
