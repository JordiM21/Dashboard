"use client";

import { useMemo, useState } from "react";
import ErrorBoundary from "@/components/ErrorBoundary";
import LiveBadge from "@/components/LiveBadge";
import { FetchFailedState, EmptyState } from "@/components/StateBox";
import { useFirestoreCollection } from "@/lib/firebase/useFirestoreCollection";
import CreateGameModal from "@/components/games/CreateGameModal";
import GameCard from "@/components/games/GameCard";
import GameEditor from "@/components/games/GameEditor";
import type { GameDoc } from "@/lib/types";

export default function GamesPage() {
  const { data, error, loading, lastUpdated } = useFirestoreCollection<GameDoc>("games", {
    orderByField: "createdAt",
    orderByDirection: "desc",
  });
  const docs = data ?? [];

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return docs.filter(
      (d) =>
        !search ||
        d.title.toLowerCase().includes(search.toLowerCase()) ||
        d.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
    );
  }, [docs, search]);

  const editingGame = docs.find((d) => d.id === editingId) ?? null;

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <div className="page-title">Games</div>
          <div className="page-subtitle">Interactive classroom activities, backed by Firestore</div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          + New Game
        </button>
      </div>

      {error && <FetchFailedState message={error} />}

      {!error && (
        <ErrorBoundary label="the games library">
          <LiveBadge lastUpdated={lastUpdated} loading={loading} />

          <div className="filter-bar">
            <input
              type="text"
              placeholder="Search by title or tag…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {data && filtered.length === 0 && (
            <EmptyState title="No games yet" hint='Click "+ New Game" above to create one.' />
          )}

          <div className="grid grid-content">
            {filtered.map((game) => (
              <GameCard key={game.id} game={game} onClick={() => setEditingId(game.id)} />
            ))}
          </div>
        </ErrorBoundary>
      )}

      {createOpen && (
        <CreateGameModal
          onClose={() => setCreateOpen(false)}
          onCreated={(game) => {
            setCreateOpen(false);
            setEditingId(game.id);
          }}
        />
      )}

      {editingGame && (
        <GameEditor
          game={editingGame}
          onClose={() => setEditingId(null)}
          onSaved={() => setEditingId(null)}
          onDeleted={() => setEditingId(null)}
        />
      )}
    </main>
  );
}
