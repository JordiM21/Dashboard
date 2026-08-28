"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { GameDoc } from "@/lib/types";
import MemoryCardsPlayer from "./MemoryCardsPlayer";
import FillGapsPlayer from "./FillGapsPlayer";
import MatchWordImagePlayer from "./MatchWordImagePlayer";
import HangmanPlayer from "./HangmanPlayer";
import SortCategoriesPlayer from "./SortCategoriesPlayer";
import SpellingBeePlayer from "./SpellingBeePlayer";

/** Fullscreen "Play" mode — same screen-share overlay pattern as Teaching's Screen Share mode (fixed inset:0, Esc to exit). */
export default function GamePlayer({ game, onExit }: { game: GameDoc; onExit: () => void }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onExit();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onExit]);

  return createPortal(
    <div className="game-play-overlay">
      <button type="button" className="game-play-exit" onClick={onExit} title="Exit Play Mode (Esc)">
        Exit Play Mode (Esc) ✕
      </button>
      <div className="game-play-inner">
        <h2 style={{ textAlign: "center", marginBottom: 24 }}>{game.title}</h2>
        {game.type === "memory-cards" && <MemoryCardsPlayer data={game.memoryCards ?? { items: [] }} />}
        {game.type === "fill-in-the-gaps" && <FillGapsPlayer data={game.fillGaps ?? { sentences: [] }} />}
        {game.type === "match-word-image" && <MatchWordImagePlayer data={game.matchWordImage ?? { pairs: [] }} />}
        {game.type === "hangman" && <HangmanPlayer data={game.hangman ?? { words: [] }} />}
        {game.type === "sort-categories" && (
          <SortCategoriesPlayer data={game.sortCategories ?? { categories: [], items: [] }} />
        )}
        {game.type === "spelling-bee" && <SpellingBeePlayer data={game.spellingBee ?? { words: [] }} />}
      </div>
    </div>,
    document.body
  );
}
