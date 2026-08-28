"use client";

import type { SortCategoriesData, SortCategory, SortItem } from "@/lib/types";

export default function SortCategoriesEditor({
  data,
  onChange,
}: {
  data: SortCategoriesData;
  onChange: (data: SortCategoriesData) => void;
}) {
  function updateCategory(id: string, name: string) {
    onChange({ ...data, categories: data.categories.map((c) => (c.id === id ? { ...c, name } : c)) });
  }
  function removeCategory(id: string) {
    onChange({ ...data, categories: data.categories.filter((c) => c.id !== id) });
  }
  function addCategory() {
    const cat: SortCategory = { id: crypto.randomUUID(), name: "" };
    onChange({ ...data, categories: [...data.categories, cat] });
  }

  function updateItem(id: string, patch: Partial<SortItem>) {
    onChange({ ...data, items: data.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  }
  function removeItem(id: string) {
    onChange({ ...data, items: data.items.filter((it) => it.id !== id) });
  }
  function addItem() {
    const firstCategoryId = data.categories[0]?.id ?? "";
    onChange({
      ...data,
      items: [...data.items, { id: crypto.randomUUID(), kind: "text", value: "", categoryId: firstCategoryId }],
    });
  }

  return (
    <div>
      <div className="repeatable-subhead">Categories</div>
      {data.categories.map((cat) => (
        <div className="repeatable-row" key={cat.id}>
          <div className="repeatable-row-fields">
            <input value={cat.name} placeholder="Category name" onChange={(e) => updateCategory(cat.id, e.target.value)} />
          </div>
          <button type="button" className="repeatable-row-remove" onClick={() => removeCategory(cat.id)}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="add-row-btn" onClick={addCategory}>
        + Add category
      </button>

      <div className="repeatable-subhead" style={{ marginTop: 22 }}>
        Items
      </div>
      {data.categories.length === 0 && (
        <div className="repeatable-row-hint" style={{ margin: "0 0 10px" }}>
          Add at least one category above before adding items.
        </div>
      )}
      {data.items.map((item) => (
        <div className="repeatable-row" key={item.id}>
          <div className="view-toggle">
            <button
              type="button"
              className={item.kind === "text" ? "active" : ""}
              onClick={() => updateItem(item.id, { kind: "text" })}
            >
              Text
            </button>
            <button
              type="button"
              className={item.kind === "image" ? "active" : ""}
              onClick={() => updateItem(item.id, { kind: "image" })}
            >
              Image
            </button>
          </div>
          <div className="repeatable-row-fields">
            <input
              value={item.value}
              placeholder={item.kind === "image" ? "Image URL or path" : "Word or phrase"}
              onChange={(e) => updateItem(item.id, { value: e.target.value })}
            />
            <select value={item.categoryId} onChange={(e) => updateItem(item.id, { categoryId: e.target.value })}>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || "Untitled"}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="repeatable-row-remove" onClick={() => removeItem(item.id)}>
            ×
          </button>
        </div>
      ))}
      <button type="button" className="add-row-btn" onClick={addItem} disabled={data.categories.length === 0}>
        + Add item
      </button>
    </div>
  );
}
