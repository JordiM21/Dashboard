"use client";

import type { GameType } from "@/lib/types";
import { GAME_TYPES } from "./gameTypes";

export default function GameTypePicker({
  value,
  onChange,
}: {
  value: GameType | null;
  onChange: (type: GameType) => void;
}) {
  return (
    <div className="game-type-grid">
      {GAME_TYPES.map((g) => (
        <button
          key={g.type}
          type="button"
          className={`game-type-card${value === g.type ? " selected" : ""}`}
          onClick={() => onChange(g.type)}
        >
          <span className="game-type-card-icon">{g.icon}</span>
          <span className="game-type-card-label">{g.label}</span>
          <span className="game-type-card-desc">{g.desc}</span>
        </button>
      ))}
    </div>
  );
}
