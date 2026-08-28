"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import LoadingLabel from "@/components/LoadingLabel";
import { authFetch } from "@/lib/firebase/authFetch";
import type { GameDoc, GameType } from "@/lib/types";
import GameTypePicker from "./GameTypePicker";
import { seedGameData } from "./gameTypes";

/** "+ New Game" flow — pick one of the four categories, then fill in the shared
    details. Mirrors CreateResourceModal's pick-a-kind-then-name pattern. */
export default function CreateGameModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (game: GameDoc) => void;
}) {
  const [step, setStep] = useState<"type" | "details">("type");
  const [type, setType] = useState<GameType | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [cover, setCover] = useState("/covers/placeholder.svg");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function chooseType(t: GameType) {
    setType(t);
    setStep("details");
  }

  async function create() {
    if (!type || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authFetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frontmatter: {
            type,
            title: title.trim(),
            description,
            tags: tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean),
            cover: cover.trim() || "/covers/placeholder.svg",
            ...seedGameData(type),
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.message ?? `Couldn't create the game (${res.status}).`);
        return;
      }
      onCreated((await res.json()) as GameDoc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={step === "type" ? "New Game — choose a type" : "New Game"} onClose={onClose}>
      {step === "type" && <GameTypePicker value={type} onChange={chooseType} />}

      {step === "details" && (
        <>
          <div className="form-row">
            <label>Title</label>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
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
          {error && <div style={{ fontSize: 13, color: "var(--danger)", marginBottom: 12 }}>{error}</div>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setStep("type")} disabled={saving}>
              Back
            </button>
            <button className="btn btn-primary" onClick={create} disabled={saving || !title.trim()}>
              <LoadingLabel loading={saving}>Create</LoadingLabel>
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
