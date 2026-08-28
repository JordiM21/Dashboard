"use client";

import type { GameDoc } from "@/lib/types";
import { gameTypeMeta } from "./gameTypes";

export default function GameCard({ game, onClick }: { game: GameDoc; onClick: () => void }) {
  const meta = gameTypeMeta(game.type);
  return (
    <div className="card game-card" onClick={onClick}>
      <img src={game.cover} alt={game.title} className="content-cover" />
      <div className="card-pad game-card-body" style={{ paddingTop: 14 }}>
        <span className="badge badge-info">
          {meta.icon} {meta.label}
        </span>
        <div style={{ fontWeight: 600, marginTop: 8 }}>{game.title}</div>
        {game.description && <div className="game-card-desc">{game.description}</div>}
        {game.tags.length > 0 && (
          <div className="game-card-tags">
            {game.tags.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
