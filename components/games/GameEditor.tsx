"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import ConfirmModal from "@/components/ConfirmModal";
import LoadingLabel from "@/components/LoadingLabel";
import { authFetch } from "@/lib/firebase/authFetch";
import type { GameDoc } from "@/lib/types";
import { gameTypeMeta } from "./gameTypes";
import MemoryCardsEditor from "./MemoryCardsEditor";
import FillGapsEditor from "./FillGapsEditor";
import MatchWordImageEditor from "./MatchWordImageEditor";
import HangmanEditor from "./HangmanEditor";
import SortCategoriesEditor from "./SortCategoriesEditor";
import SpellingBeeEditor from "./SpellingBeeEditor";
import GamePlayer from "./GamePlayer";

export default function GameEditor({
  game,
  onClose,
  onSaved,
  onDeleted,
}: {
  game: GameDoc;
  onClose: () => void;
  onSaved: (game: GameDoc) => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(game.title);
  const [description, setDescription] = useState(game.description);
  const [tags, setTags] = useState(game.tags.join(", "));
  const [cover, setCover] = useState(game.cover);
  const [memoryCards, setMemoryCards] = useState(game.memoryCards ?? { items: [] });
  const [fillGaps, setFillGaps] = useState(game.fillGaps ?? { sentences: [] });
  const [matchWordImage, setMatchWordImage] = useState(game.matchWordImage ?? { pairs: [] });
  const [hangman, setHangman] = useState(game.hangman ?? { words: [] });
  const [sortCategories, setSortCategories] = useState(game.sortCategories ?? { categories: [], items: [] });
  const [spellingBee, setSpellingBee] = useState(game.spellingBee ?? { words: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [playing, setPlaying] = useState(false);

  const meta = gameTypeMeta(game.type);

  function typeData(): Pick<
    GameDoc,
    "memoryCards" | "fillGaps" | "matchWordImage" | "hangman" | "sortCategories" | "spellingBee"
  > {
    switch (game.type) {
      case "memory-cards":
        return { memoryCards };
      case "fill-in-the-gaps":
        return { fillGaps };
      case "match-word-image":
        return { matchWordImage };
      case "hangman":
        return { hangman };
      case "sort-categories":
        return { sortCategories };
      case "spelling-bee":
        return { spellingBee };
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch(`/api/games/${game.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frontmatter: {
            title: title.trim(),
            description,
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            cover: cover.trim() || "/covers/placeholder.svg",
            ...typeData(),
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? `Couldn't save the game (${res.status}).`);
        return;
      }
      onSaved((await res.json()) as GameDoc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    await authFetch(`/api/games/${game.id}`, { method: "DELETE" });
    onDeleted();
  }

  const liveGame: GameDoc = { ...game, title, description, cover, ...typeData() };

  return (
    <>
      <Modal title={`${meta.icon} ${title || "Untitled Game"}`} onClose={onClose} maxWidth={760}>
        <div className="form-row">
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Description</label>
          <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Cover image path or URL</label>
          <div className="cover-input-row">
            <input style={{ flex: 1 }} value={cover} onChange={(e) => setCover(e.target.value)} />
            <img
              src={cover.trim() || "/covers/placeholder.svg"}
              alt=""
              className="cover-preview"
              onError={(e) => {
                e.currentTarget.src = "/covers/placeholder.svg";
              }}
            />
          </div>
        </div>
        <div className="form-row">
          <label>Tags (comma separated)</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>

        <div className="section-title">{meta.label} content</div>
        {game.type === "memory-cards" && <MemoryCardsEditor data={memoryCards} onChange={setMemoryCards} />}
        {game.type === "fill-in-the-gaps" && <FillGapsEditor data={fillGaps} onChange={setFillGaps} />}
        {game.type === "match-word-image" && (
          <MatchWordImageEditor data={matchWordImage} onChange={setMatchWordImage} />
        )}
        {game.type === "hangman" && <HangmanEditor data={hangman} onChange={setHangman} />}
        {game.type === "sort-categories" && (
          <SortCategoriesEditor data={sortCategories} onChange={setSortCategories} />
        )}
        {game.type === "spelling-bee" && (
          <SpellingBeeEditor gameId={game.id} data={spellingBee} onChange={setSpellingBee} />
        )}

        {error && <div style={{ fontSize: 13, color: "var(--danger)", marginTop: 12 }}>{error}</div>}
        <div className="modal-actions" style={{ justifyContent: "space-between" }}>
          <button className="btn btn-danger" onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => setPlaying(true)}>
              ▶ Play
            </button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              <LoadingLabel loading={saving}>Save</LoadingLabel>
            </button>
          </div>
        </div>
      </Modal>

      {confirmingDelete && (
        <ConfirmModal
          title="Delete game"
          message={`Delete "${title}"? This can't be undone.`}
          onConfirm={remove}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {playing && <GamePlayer game={liveGame} onExit={() => setPlaying(false)} />}
    </>
  );
}
