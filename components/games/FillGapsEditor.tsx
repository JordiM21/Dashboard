"use client";

import type { FillGapsData, FillGapsSentence } from "@/lib/types";

export default function FillGapsEditor({
  data,
  onChange,
}: {
  data: FillGapsData;
  onChange: (data: FillGapsData) => void;
}) {
  function update(id: string, patch: Partial<FillGapsSentence>) {
    onChange({ sentences: data.sentences.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }
  function remove(id: string) {
    onChange({ sentences: data.sentences.filter((s) => s.id !== id) });
  }
  function add() {
    onChange({ sentences: [...data.sentences, { id: crypto.randomUUID(), text: "___", answer: "" }] });
  }

  return (
    <div>
      {data.sentences.map((s) => (
        <div key={s.id} style={{ marginBottom: 14 }}>
          <div className="repeatable-row" style={{ marginBottom: s.text.includes("___") ? 10 : 4 }}>
            <div className="repeatable-row-fields">
              <input
                value={s.text}
                placeholder="Sentence with ___ for the blank"
                onChange={(e) => update(s.id, { text: e.target.value })}
              />
              <input
                value={s.answer}
                placeholder="Answer"
                className="fill-gap-answer-input"
                onChange={(e) => update(s.id, { answer: e.target.value })}
              />
            </div>
            <button type="button" className="repeatable-row-remove" onClick={() => remove(s.id)}>
              ×
            </button>
          </div>
          {!s.text.includes("___") && (
            <div className="repeatable-row-hint">Add "___" where the blank should go.</div>
          )}
        </div>
      ))}
      <button type="button" className="add-row-btn" onClick={add}>
        + Add sentence
      </button>
    </div>
  );
}
