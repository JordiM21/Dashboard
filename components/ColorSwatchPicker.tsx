"use client";

import { OBSIDIAN_COLORS } from "@/lib/obsidianColors";

/** A row of preset color swatches (Obsidian vault palette) plus a native color input for anything custom. Shared by folder and tag color pickers. */
export default function ColorSwatchPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {OBSIDIAN_COLORS.map((c) => (
        <button
          key={c.hex}
          type="button"
          title={c.name}
          onClick={() => onChange(c.hex)}
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: c.hex,
            border: value === c.hex ? "2px solid var(--ink)" : "2px solid transparent",
            boxShadow: "0 0 0 1px var(--line)",
            cursor: "pointer",
            padding: 0,
          }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        title="Custom color"
        style={{ width: 26, height: 26, padding: 0, border: "none", borderRadius: "50%", cursor: "pointer", background: "none" }}
      />
    </div>
  );
}
