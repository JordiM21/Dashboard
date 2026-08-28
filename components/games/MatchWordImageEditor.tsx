"use client";

import type { MatchPair, MatchWordImageData } from "@/lib/types";

export default function MatchWordImageEditor({
  data,
  onChange,
}: {
  data: MatchWordImageData;
  onChange: (data: MatchWordImageData) => void;
}) {
  function update(id: string, patch: Partial<MatchPair>) {
    onChange({ pairs: data.pairs.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  }
  function remove(id: string) {
    onChange({ pairs: data.pairs.filter((p) => p.id !== id) });
  }
  function add() {
    onChange({ pairs: [...data.pairs, { id: crypto.randomUUID(), word: "", image: "" }] });
  }

  return (
    <div>
      {data.pairs.map((p) => (
        <div className="repeatable-row" key={p.id}>
          <div className="repeatable-row-fields">
            <input value={p.word} placeholder="Word" onChange={(e) => update(p.id, { word: e.target.value })} />
            <input
              value={p.image}
              placeholder="Image URL or path"
              onChange={(e) => update(p.id, { image: e.target.value })}
            />
          </div>
          <button type="button" className="repeatable-row-remove" onClick={() => remove(p.id)}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="add-row-btn" onClick={add}>
        + Add pair
      </button>
    </div>
  );
}
