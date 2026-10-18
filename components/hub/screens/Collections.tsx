"use client";

/**
 * Collections (§5.8): one generic engine. A Collection is a name + field
 * schema; new list types need zero code. Folder cards are the focal point.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { ArrowLeft, Plus, X, GameController, SlidersHorizontal } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import * as A from "@/lib/hub/actions";
import type { Collection, FieldDef, FieldType, Item } from "@/lib/hub/types";
import { Toolbar, useArea, useShell } from "../Shell";
import { Empty, Fade, IconByName, ICONS, Segmented, Sheet, Check } from "../ui";
import { CoverPicker, IconPicker, coverCss } from "../Customize";

export default function Collections() {
  const s = useHub();
  const { match } = useArea();
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const cols = s.collections.filter((c) => !c.archivedAt && match(c.areaId));
  const c = s.collections.find((x) => x.id === open);

  return (
    <>
      <Toolbar title="Collections">
        {c && (
          <Segmented
            label="View"
            size="sm"
            value={c.view}
            onChange={(v) => A.updateCollection(c.id, { view: v })}
            options={[{ value: "list", label: "List" }, { value: "grid", label: "Grid" }, ...(c.fields.some((f) => f.type === "select") ? [{ value: "board" as const, label: "Board" }] : [])]}
          />
        )}
        <button className="btn" onClick={() => setCreating(true)}>
          <Plus size={14} /> Collection
        </button>
      </Toolbar>
      <Fade className="canvas" k={open ?? "root"}>
        {c ? (
          <CollectionView c={c} onBack={() => setOpen(null)} />
        ) : (
          <>
            <header className="page-head">
              <div>
                <h1 className="display-xl">Collections</h1>
                <p className="callout muted">Game backlogs, wishlists, places, dates — any list, with your own fields. Quick-add with “/games Elden Ring”.</p>
              </div>
            </header>
            <div className="grid-cards">
              {cols.map((x) => {
                const a = s.areas.find((y) => y.id === x.areaId);
                const items = s.items.filter((i) => i.collectionId === x.id && !i.archivedAt);
                const done = items.filter((i) => A.isItemDone(x, i)).length;
                return (
                  <button key={x.id} className="folder" style={{ "--c": a?.color } as CSSProperties} onClick={() => setOpen(x.id)}>
                    {x.cover && <div className="card-cover" style={{ background: coverCss(x.cover) }} />}
                    <span className="folder-icon">
                      <IconByName name={x.icon} weight="duotone" />
                    </span>
                    <span className="headline">{x.name}</span>
                    <span className="caption muted truncate">
                      {x.description || a?.name}
                      {x.doneField ? ` · ${done} done` : ""}
                    </span>
                    <span className="count">{items.length}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Fade>
      <NewCollection open={creating} onClose={() => setCreating(false)} onCreated={(id) => setOpen(id)} />
    </>
  );
}

function CollectionView({ c, onBack }: { c: Collection; onBack: () => void }) {
  const s = useHub();
  const { inspect } = useShell();
  const [title, setTitle] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const items = s.items.filter((i) => i.collectionId === c.id && !i.archivedAt).sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || (a.createdAt < b.createdAt ? 1 : -1));
  const boardField = c.fields.find((f) => f.key === c.boardField) ?? c.fields.find((f) => f.type === "select");
  const show = (f: FieldDef, v: unknown) => (v == null || v === "" ? "" : f.type === "checkbox" ? (v ? "✓" : "") : Array.isArray(v) ? v.join(", ") : f.type === "number" && /price|budget/i.test(f.key) ? `$${v}` : String(v));
  const open = (i: Item) => inspect({ kind: "item", id: i.id });
  const [editing, setEditing] = useState(false);

  return (
    <>
      {c.cover && (
        <div style={{ marginBottom: 16 }}>
          <CoverPicker value={c.cover} onChange={(cover) => A.updateCollection(c.id, { cover })} height={150} />
        </div>
      )}
      <NewCollection open={editing} onClose={() => setEditing(false)} edit={c} />
      <div className="row" style={{ marginBottom: 20 }}>
        <button className="icon-btn" aria-label="Back to collections" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <IconPicker icon={c.icon} color={s.areas.find((a) => a.id === c.areaId)?.color} size={44} onIcon={(icon) => A.updateCollection(c.id, { icon })} />
        <input className="input-bare display-xl inline-edit" style={{ width: `${Math.max(4, c.name.length + 1)}ch` }} value={c.name} onChange={(e) => A.updateCollection(c.id, { name: e.target.value })} aria-label="Collection name" />
        <span className="caption muted">{items.length} items</span>
        <button className="btn btn-sm btn-ghost" onClick={() => setEditing(true)}>
          <SlidersHorizontal size={14} /> Fields
        </button>
        {!c.cover && <CoverPicker value={undefined} onChange={(cover) => A.updateCollection(c.id, { cover })} />}
        <span className="spacer" />
        <form
          className="row sb-search"
          style={{ width: 300, margin: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            A.addItem(c.id, title.trim(), boardField && c.view === "board" ? {} : {});
            setTitle("");
          }}
        >
          <Plus size={14} />
          <input className="input-bare callout" placeholder={`Add to ${c.name}`} value={title} onChange={(e) => setTitle(e.target.value)} />
        </form>
      </div>
      <textarea
        className="input-bare callout inline-edit"
        rows={1}
        style={{ resize: "none", color: "var(--text-2)", margin: "-8px 0 16px 52px", width: "calc(100% - 52px)" }}
        value={c.description ?? ""}
        placeholder="Add a description…"
        onChange={(e) => A.updateCollection(c.id, { description: e.target.value })}
        aria-label="Collection description"
      />
      {items.length === 0 && <Empty text="Empty collection." />}

      {c.view === "list" && items.length > 0 && (
        <div className="card" style={{ padding: 8 }}>
          <table className="table">
            <thead>
              <tr>
                <th className="label">Title</th>
                {c.fields.map((f) => (
                  <th key={f.key} className="label">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} onClick={() => open(i)} style={{ cursor: "pointer", ...(i.doneAt ? { color: "var(--text-3)" } : {}) }}>
                  <td style={{ fontWeight: 500 }}>{i.title}</td>
                  {c.fields.map((f) => (
                    <td key={f.key} onClick={(e) => f.type === "checkbox" && e.stopPropagation()}>
                      {f.type === "checkbox" ? <Check square checked={!!i.values[f.key]} label={f.label} onChange={() => A.updateItem(i.id, { values: { [f.key]: !i.values[f.key] } })} /> : show(f, i.values[f.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {c.view === "grid" && items.length > 0 && (
        <div className="grid-cards" style={{ paddingTop: 0 }}>
          {items.map((i) => (
            <button key={i.id} className="card hoverable col" style={{ padding: 0, overflow: "hidden", textAlign: "left", gap: 0, opacity: i.doneAt ? 0.7 : 1 }} onClick={() => open(i)}>
              <div style={{ height: 120, background: coverCss(i.image) ?? "linear-gradient(135deg, var(--bg-sunken), var(--bg-raised))", display: "grid", placeItems: "center", color: "var(--text-3)" }}>
                {!i.image && <IconByName name={c.icon} size={32} weight="duotone" />}
              </div>
              <div className="col" style={{ padding: 14, gap: 6 }}>
                <span className="headline">{i.title}</span>
                <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
                  {c.fields
                    .filter((f) => show(f, i.values[f.key]))
                    .slice(0, 3)
                    .map((f) => (
                      <span key={f.key} className={`chip ${i.doneAt && f.key === c.doneField ? "success" : ""}`}>
                        {f.type === "checkbox" ? f.label : show(f, i.values[f.key])}
                      </span>
                    ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {c.view === "board" && boardField && items.length > 0 && (
        <div className="board" style={{ gridTemplateColumns: `repeat(${(boardField.options?.length ?? 0) + 1}, minmax(200px, 1fr))`, overflowX: "auto" }}>
          {[...(boardField.options ?? []), ""].map((opt) => {
            const col = items.filter((i) => (i.values[boardField.key] ?? "") === opt);
            if (!opt && col.length === 0) return null;
            return (
              <div
                key={opt || "none"}
                className="board-col"
                data-over={over === opt}
                onDragOver={(e) => (e.preventDefault(), setOver(opt))}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  setOver(null);
                  A.updateItem(e.dataTransfer.getData("text/plain"), { values: { [boardField.key]: opt } });
                }}
              >
                <div className="row" style={{ padding: "2px 4px" }}>
                  <span className="headline">{opt || "No " + boardField.label.toLowerCase()}</span>
                  <span className="caption faint">{col.length}</span>
                </div>
                {col.map((i) => (
                  <button key={i.id} className="board-card" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)} onClick={() => open(i)}>
                    <span style={{ fontWeight: 500 }}>{i.title}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

const TYPES: FieldType[] = ["text", "number", "select", "multiselect", "date", "checkbox", "url", "image"];

/** Create a collection, or edit an existing one's name, icon and field schema (existing values survive: field keys never change). */
function NewCollection({ open, onClose, onCreated, edit }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void; edit?: Collection }) {
  const s = useHub();
  const [name, setName] = useState("");
  const [areaId, setAreaId] = useState("hobbies");
  const [icon, setIcon] = useState("GameController");
  const [fields, setFields] = useState<(FieldDef & { opts?: string })[]>([]);
  useEffect(() => {
    if (!open) return;
    setName(edit?.name ?? "");
    setAreaId(edit?.areaId ?? (s.ui.area === "all" ? "hobbies" : s.ui.area));
    setIcon(edit?.icon ?? "GameController");
    setFields(edit ? edit.fields.map((f) => ({ ...f, opts: f.options?.join(", ") })) : [{ key: "", label: "Status", type: "select", opts: "To do, Doing, Done" }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, edit?.id]);
  const save = () => {
    if (!name.trim()) return;
    const defs: FieldDef[] = fields
      .filter((f) => f.label.trim())
      .map((f) => ({ key: f.key || f.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"), label: f.label.trim(), type: f.type, ...(f.type === "select" || f.type === "multiselect" ? { options: (f.opts ?? "").split(",").map((o) => o.trim()).filter(Boolean) } : {}) }));
    const firstSelect = defs.find((f) => f.type === "select");
    const keepDone = edit?.doneField && defs.some((f) => f.key === edit.doneField);
    const done = keepDone ? { doneField: edit!.doneField, doneValue: edit!.doneValue } : { doneField: firstSelect?.options?.includes("Done") ? firstSelect.key : undefined, doneValue: "Done" };
    const boardField = edit?.boardField && defs.some((f) => f.key === edit.boardField) ? edit.boardField : firstSelect?.key;
    if (edit) A.updateCollection(edit.id, { name: name.trim(), areaId, icon, fields: defs, boardField, ...done });
    else onCreated?.(A.addCollection({ name: name.trim(), areaId, icon, fields: defs, view: "list", boardField, ...done }).id);
    onClose();
  };
  return (
    <Sheet open={open} onClose={onClose} label={edit ? "Edit collection" : "New collection"}>
      <h2 className="title">{edit ? "Edit collection" : "New collection"}</h2>
      <div className="row">
        <label className="field grow">
          <span>Name</span>
          <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Board games, Recipes…" />
        </label>
        <label className="field">
          <span>Area</span>
          <select className="select" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
            {s.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        <span>Icon</span>
        <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
          {Object.keys(ICONS).map((k) => (
            <button key={k} className="icon-btn" aria-pressed={icon === k} title={k} onClick={() => setIcon(k)} style={icon === k ? { background: "var(--accent-soft)", color: "var(--accent)" } : undefined}>
              <IconByName name={k} />
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Fields</span>
        {fields.map((f, i) => (
          <div key={i} className="row">
            <input className="input" placeholder="Field name" value={f.label} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <select className="select" style={{ width: 140 }} value={f.type} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, type: e.target.value as FieldType } : x)))}>
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            {(f.type === "select" || f.type === "multiselect") && <input className="input" placeholder="Options, comma separated" value={f.opts ?? ""} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, opts: e.target.value } : x)))} />}
            <button className="icon-btn" aria-label="Remove field" onClick={() => setFields(fields.filter((_, j) => j !== i))}>
              <X size={14} />
            </button>
          </div>
        ))}
        <button className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setFields([...fields, { key: "", label: "", type: "text" }])}>
          <Plus size={14} /> Field
        </button>
      </div>
      <div className="row">
        <span className="caption faint grow">A select field with a “Done” option counts toward goals.</span>
        <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>
          <GameController size={14} /> {edit ? "Save" : "Create"}
        </button>
      </div>
    </Sheet>
  );
}
