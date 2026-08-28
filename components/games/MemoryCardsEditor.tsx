"use client";

import type { MemoryCardsData, MemoryCardsItem } from "@/lib/types";

export default function MemoryCardsEditor({
  data,
  onChange,
}: {
  data: MemoryCardsData;
  onChange: (data: MemoryCardsData) => void;
}) {
  function update(id: string, patch: Partial<MemoryCardsItem>) {
    onChange({ items: data.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  }
  function remove(id: string) {
    onChange({ items: data.items.filter((it) => it.id !== id) });
  }
  function add() {
    onChange({ items: [...data.items, { id: crypto.randomUUID(), kind: "text", value: "" }] });
  }

  return (
    <div>
      {data.items.map((item) => (
        <div className="repeatable-row" key={item.id}>
          <div className="view-toggle">
            <button type="button" className={item.kind === "text" ? "active" : ""} onClick={() => update(item.id, { kind: "text" })}>
              Text
            </button>
            <button type="button" className={item.kind === "image" ? "active" : ""} onClick={() => update(item.id, { kind: "image" })}>
              Image
            </button>
          </div>
          <div className="repeatable-row-fields">
            <input
              value={item.value}
              placeholder={item.kind === "image" ? "Image URL or path" : "Word or phrase"}
              onChange={(e) => update(item.id, { value: e.target.value })}
            />
          </div>
          <button type="button" className="repeatable-row-remove" onClick={() => remove(item.id)}>
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
