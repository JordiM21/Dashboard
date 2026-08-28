"use client";

import { useMemo, useState } from "react";
import { playConfettiChime, playVictoryFanfare } from "@/lib/soundEffects";
import type { SortCategoriesData } from "@/lib/types";
import { shuffle } from "./gameTypes";

export default function SortCategoriesPlayer({ data }: { data: SortCategoriesData }) {
  const items = useMemo(() => shuffle(data.items), [data]);

  const [placed, setPlaced] = useState<Set<string>>(new Set());
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const [wrongCategoryId, setWrongCategoryId] = useState<string | null>(null);
  const [won, setWon] = useState(false);

  const total = items.length;
  const score = placed.size;

  function attemptDrop(categoryId: string) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverCategoryId(null);
      const itemId = e.dataTransfer.getData("text/plain");
      const item = items.find((i) => i.id === itemId);
      if (!item || placed.has(itemId)) return;

      if (item.categoryId === categoryId) {
        const next = new Set(placed).add(itemId);
        setPlaced(next);
        void playConfettiChime();
        if (next.size === total) {
          setWon(true);
          void playVictoryFanfare();
        }
      } else {
        setWrongCategoryId(categoryId);
        setTimeout(() => setWrongCategoryId(null), 350);
      }
    };
  }

  const bank = items.filter((i) => !placed.has(i.id));

  return (
    <>
      <div className="game-play-score">
        ⭐ <span key={score} className="game-play-score-value">{score}</span> / {total}
      </div>
      {won && <div className="game-play-banner">🎉 Everything sorted!</div>}

      <div className="sort-bins">
        {data.categories.map((cat) => (
          <div
            key={cat.id}
            className={`sort-bin${dragOverCategoryId === cat.id ? " sort-bin-over" : ""}${
              wrongCategoryId === cat.id ? " sort-bin-wrong" : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverCategoryId(cat.id);
            }}
            onDragLeave={() => setDragOverCategoryId((id) => (id === cat.id ? null : id))}
            onDrop={attemptDrop(cat.id)}
          >
            <div className="sort-bin-title">{cat.name || "Untitled"}</div>
            <div className="sort-bin-items">
              {items
                .filter((i) => placed.has(i.id) && i.categoryId === cat.id)
                .map((i) => (
                  <div key={i.id} className={`sort-chip placed${i.kind === "image" ? " sort-chip-image" : ""}`}>
                    {i.kind === "image" ? <img src={i.value} alt="" /> : i.value}
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div className="sort-bank">
        {bank.map((item) => (
          <div
            key={item.id}
            className={`sort-chip${item.kind === "image" ? " sort-chip-image" : ""}`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", item.id);
              e.dataTransfer.effectAllowed = "move";
              e.currentTarget.classList.add("dragging");
            }}
            onDragEnd={(e) => e.currentTarget.classList.remove("dragging")}
          >
            {item.kind === "image" ? <img src={item.value} alt="" /> : item.value}
          </div>
        ))}
      </div>
    </>
  );
}
