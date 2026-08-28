"use client";

import type { HangmanData, HangmanWord } from "@/lib/types";

export default function HangmanEditor({
  data,
  onChange,
}: {
  data: HangmanData;
  onChange: (data: HangmanData) => void;
}) {
  function update(id: string, patch: Partial<HangmanWord>) {
    onChange({ words: data.words.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
  }
  function remove(id: string) {
    onChange({ words: data.words.filter((w) => w.id !== id) });
  }
  function add() {
    onChange({ words: [...data.words, { id: crypto.randomUUID(), word: "", hint: "" }] });
  }

  return (
    <div>
      {data.words.map((w) => (
        <div className="repeatable-row" key={w.id}>
          <div className="repeatable-row-fields">
            <input
              value={w.word}
              placeholder="Word"
              onChange={(e) => update(w.id, { word: e.target.value.toUpperCase() })}
            />
            <input value={w.hint ?? ""} placeholder="Hint (optional)" onChange={(e) => update(w.id, { hint: e.target.value })} />
          </div>
          <button type="button" className="repeatable-row-remove" onClick={() => remove(w.id)}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="add-row-btn" onClick={add}>
        + Add word
      </button>
    </div>
  );
}
