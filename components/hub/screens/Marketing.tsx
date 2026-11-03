"use client";

/**
 * Marketing: the playbook. What Jordi says from first contact to the first classes, stored as two-sided
 * conversations (same bubbles as the Brain thread) so the answer never changes, and copied in one click.
 * "First days of class" holds plans instead: ordered steps tied to a Library folder. Model: lib/hub/marketing.ts.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowUp, Check, Copy, DotsThree, FileText, Folder, MagnifyingGlass, PencilSimple, Plus } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import * as A from "@/lib/hub/actions";
import { announce, toast } from "@/lib/hub/fx";
import { copyText, isPlan, searchText, stageLabel, STAGES, starterScripts } from "@/lib/hub/marketing";
import { sfx } from "@/lib/hub/sound";
import { uid } from "@/lib/hub/util";
import type { PlanStep, Script, ScriptMessage, ScriptStage } from "@/lib/hub/types";
import { Toolbar } from "../Shell";
import { Empty, Fade, IconByName, Segmented, useDropdown } from "../ui";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const arrive = { initial: { opacity: 0, y: 14, scale: 0.92 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { type: "spring", stiffness: 420, damping: 28 } } as const;

/** Moves one entry of a list up or down; a no-op at the ends. */
function shift<T>(xs: T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (j < 0 || j >= xs.length) return xs;
  const next = [...xs];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function CopyBtn({ text, label = "Copy", what = "message", primary }: { text: string; label?: string; what?: string; primary?: boolean }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const run = () =>
    navigator.clipboard.writeText(text).then(
      () => {
        sfx.primary();
        announce(`Copied ${what}`);
        setDone(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setDone(false), 1400);
      },
      () => toast("Couldn’t copy. Select the text instead.")
    );
  return (
    <button type="button" className={primary ? "btn btn-primary" : "mk-copy"} data-done={done} data-icon-only={!label} disabled={!text} aria-label={label ? undefined : `Copy ${what}`} title={label ? undefined : `Copy ${what}`} data-sound="none" onClick={run}>
      {done ? <Check size={14} weight="bold" /> : <Copy size={14} />}
      {label && <span>{done ? "Copied" : label}</span>}
    </button>
  );
}

export default function Marketing() {
  const s = useHub();
  const params = useSearchParams();
  const drop = useDropdown();
  const [sel, setSel] = useState<string | null>(params.get("open"));
  const [open, setOpen] = useState(!!params.get("open")); // mobile: the conversation replaces the list
  const [fresh, setFresh] = useState<string | null>(null); // just created: focus its title
  const [q, setQ] = useState("");

  useEffect(() => {
    const id = params.get("open");
    if (id) (setSel(id), setOpen(true));
  }, [params]);

  const scripts = useMemo(() => s.scripts.filter((x) => !x.archivedAt), [s.scripts]);
  const n = norm(q.trim());
  const shown = useMemo(() => (n ? scripts.filter((x) => norm(searchText(x)).includes(n)) : scripts), [scripts, n]);
  const current = scripts.find((x) => x.id === sel) ?? shown[0];

  const pick = (id: string) => (setSel(id), setOpen(true));
  const create = (stage: ScriptStage) => {
    const x = A.addScript({ stage, title: "", ...(stage === "first-days" ? { steps: [{ id: uid(), title: "Day 1", text: "" }] } : {}) });
    setQ("");
    setFresh(x.id);
    pick(x.id);
  };
  const newMenu = (e: MouseEvent) => drop(e, STAGES.map((g) => ({ label: g.label, onClick: () => create(g.id) })));

  return (
    <>
      <Toolbar areas={false} title="Marketing">
        <button className="btn" onClick={newMenu}>
          <Plus size={14} /> Message
        </button>
      </Toolbar>
      <Fade className="canvas">
        {!scripts.length ? (
          <Empty text="Your sales messages live here, so every parent gets the same answer. Start from the outline: opener, price, slots, link, objections, after payment and first days of class. You write the words." action="Add the outline" onAction={() => {
            const made = starterScripts().map((x) => A.addScript(x));
            setSel(made[0].id);
          }} />
        ) : (
          <div className="mk" data-open={open}>
            <nav className="mk-nav" aria-label="Saved messages">
              <div className="row sb-search mk-search">
                <MagnifyingGlass size={14} />
                <input className="input-bare callout" type="search" placeholder="Search every message" aria-label="Search every message" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="mk-list">
                {n && !shown.length && <p className="caption muted" style={{ padding: "4px 8px" }}>Nothing says “{q.trim()}”.</p>}
                {STAGES.map((g) => {
                  const here = shown.filter((x) => x.stage === g.id);
                  if (n && !here.length) return null;
                  return (
                    <section key={g.id} className="mk-group">
                      <div className="mk-group-head">
                        <span className="label grow">{g.label}</span>
                        <button className="icon-btn" aria-label={`New in ${g.label}`} title={`New in ${g.label}`} onClick={() => create(g.id)}>
                          <Plus size={14} />
                        </button>
                      </div>
                      {!here.length && <button className="mk-hint caption" onClick={() => create(g.id)}>{g.empty}</button>}
                      {here.map((x) => {
                        const text = copyText(x);
                        return (
                          <div key={x.id} className="mk-row" aria-current={current?.id === x.id}>
                            <button className="mk-row-main" onClick={() => pick(x.id)}>
                              <span className="truncate" style={{ fontWeight: 500 }}>{x.title || "Untitled"}</span>
                              <span className="caption muted truncate">{text.replace(/\s+/g, " ") || "Nothing written yet"}</span>
                            </button>
                            {text && <CopyBtn text={text} label="" what={x.title || "message"} />}
                          </div>
                        );
                      })}
                    </section>
                  );
                })}
              </div>
            </nav>
            {current && <Detail key={current.id} x={current} focusTitle={fresh === current.id} onBack={() => setOpen(false)} onDuplicate={(id) => pick(id)} />}
          </div>
        )}
      </Fade>
    </>
  );
}

function Detail({ x, focusTitle, onBack, onDuplicate }: { x: Script; focusTitle: boolean; onBack: () => void; onDuplicate: (id: string) => void }) {
  const drop = useDropdown();
  const text = copyText(x);
  const plan = isPlan(x);
  const count = x.messages.filter((m) => m.from === "me").length;
  const menu = (e: MouseEvent) =>
    drop(e, [
      // A plan's stage decides its shape, so only conversations can change stage.
      ...(plan ? [] : STAGES.filter((g) => g.id !== x.stage && g.id !== "first-days").map((g) => ({ label: `Move to ${g.label}`, onClick: () => A.updateScript(x.id, { stage: g.id }) }))),
      ...(plan ? [] : [{ sep: true, label: "" }]),
      { label: "Duplicate", onClick: () => onDuplicate(A.addScript({ stage: x.stage, title: `${x.title} (copy)`, messages: x.messages.map((m) => ({ ...m, id: uid() })), steps: x.steps.map((p) => ({ ...p, id: uid() })), folderId: x.folderId ?? null }).id) },
      { label: "Delete", danger: true, onClick: () => A.archive("scripts", x.id, `Deleted “${x.title || "Untitled"}”`) },
    ]);
  return (
    <section className="card msgs mk-detail" aria-label={x.title || "Untitled"}>
      <header className="msgs-head mk-head">
        <button className="icon-btn mk-back" aria-label="Back to the list" onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
          <input
            ref={(el) => { if (el && focusTitle && !el.dataset.f) (el.dataset.f = "1"), el.focus(); }}
            className="input-bare headline"
            value={x.title}
            placeholder={plan ? "Name this plan" : "Name this message, e.g. Price"}
            aria-label="Title"
            onChange={(e) => A.updateScript(x.id, { title: e.target.value })}
          />
          <span className="caption muted">{stageLabel(x.stage)}</span>
        </div>
        <CopyBtn primary text={text} what={x.title || "message"} label={plan ? "Copy plan" : count > 1 ? `Copy all ${count}` : "Copy"} />
        <button className="icon-btn" aria-label="More" onClick={menu}>
          <DotsThree size={18} />
        </button>
      </header>
      {plan ? <Plan x={x} /> : <Conversation x={x} />}
    </section>
  );
}

function Conversation({ x }: { x: Script }) {
  const drop = useDropdown();
  const reduce = useReducedMotion();
  const [draft, setDraft] = useState("");
  const [side, setSide] = useState<ScriptMessage["from"]>("me");
  const [editing, setEditing] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const seen = useRef(x.messages.length);

  useEffect(() => {
    // Only a new bubble scrolls: an opened script starts at its beginning.
    if (x.messages.length > seen.current) scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
    seen.current = x.messages.length;
  }, [x.messages.length, reduce]);

  const set = (messages: ScriptMessage[]) => A.updateScript(x.id, { messages });
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    set([...x.messages, { id: uid(), from: side, text }]);
    setDraft("");
    setSide("me"); // the usual next line is your answer
    sfx.primary();
  };
  const menu = (e: MouseEvent, m: ScriptMessage, i: number) => {
    const before = x.messages;
    drop(e, [
      { label: "Move up", onClick: () => set(shift(before, i, -1)) },
      { label: "Move down", onClick: () => set(shift(before, i, 1)) },
      { label: m.from === "me" ? "Make it the parent’s" : "Make it mine", onClick: () => set(before.map((y) => (y.id === m.id ? { ...y, from: m.from === "me" ? "them" : "me" } : y))) },
      { sep: true, label: "" },
      { label: "Delete", danger: true, onClick: () => (set(before.filter((y) => y.id !== m.id)), toast("Message deleted", { undo: () => set(before) })) },
    ]);
  };

  return (
    <>
      <div className="msgs-scroll" ref={scroller} role="log" aria-label="Conversation">
        {!x.messages.length ? (
          <p className="msgs-empty">Write what you send. If it answers a question, add the parent&apos;s question first with “Parent says”.</p>
        ) : (
          <div className="msgs-inner">
            <AnimatePresence initial={false}>
              {x.messages.map((m, i) => (
                // data-from reuses the Brain thread's bubbles: left is the other person, right is Jordi.
                <motion.div key={m.id} layout="position" className="msg mk-msg" data-from={m.from === "me" ? "jordi" : "claude"} {...arrive} transition={reduce ? { duration: 0 } : arrive.transition}>
                  {editing === m.id ? (
                    <textarea
                      autoFocus
                      className="mk-edit"
                      defaultValue={m.text}
                      aria-label="Edit message"
                      onKeyDown={(e) => {
                        if (e.key === "Escape") (e.currentTarget.value = m.text), e.currentTarget.blur();
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.blur();
                      }}
                      onBlur={(e) => {
                        const text = e.target.value.trim();
                        if (text && text !== m.text) set(x.messages.map((y) => (y.id === m.id ? { ...y, text } : y)));
                        setEditing(null);
                      }}
                    />
                  ) : (
                    <div className="bubble">{m.text}</div>
                  )}
                  <div className="mk-acts">
                    {m.from === "me" && <CopyBtn text={m.text} />}
                    <button className="icon-btn mk-more" aria-label="Edit message" title="Edit" onClick={() => setEditing(m.id)}>
                      <PencilSimple size={14} />
                    </button>
                    <button className="icon-btn mk-more" aria-label="More for this message" title="Move, switch side, delete" onClick={(e) => menu(e, m, i)}>
                      <DotsThree size={16} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
      <form className="msgs-composer" onSubmit={(e) => (e.preventDefault(), send())}>
        <div className="msgs-composer-inner">
          <Segmented label="Who says this" size="sm" value={side} onChange={setSide} options={[{ value: "me", label: "I say" }, { value: "them", label: "Parent says" }]} />
          <div className="msgs-field">
            <textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) (e.preventDefault(), send());
              }}
              placeholder={side === "me" ? "Write your message" : "What does the parent ask?"}
              aria-label={side === "me" ? "Your message" : "The parent's message"}
            />
            {draft.trim() && (
              <motion.button type="submit" className="msgs-send" aria-label="Add" data-sound="none" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} whileTap={{ scale: 0.88 }} transition={{ type: "spring", stiffness: 500, damping: 26 }}>
                <ArrowUp size={16} weight="bold" />
              </motion.button>
            )}
          </div>
        </div>
      </form>
    </>
  );
}

function Plan({ x }: { x: Script }) {
  const live = useLive();
  const drop = useDropdown();
  const folder = live.folders.find((f) => f.id === x.folderId);
  const files = folder ? live.files.filter((f) => f.folderId === folder.id) : [];
  const set = (steps: PlanStep[]) => A.updateScript(x.id, { steps });
  const edit = (id: string, patch: Partial<PlanStep>) => set(x.steps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const add = () => set([...x.steps, { id: uid(), title: `Day ${x.steps.length + 1}`, text: "" }]);
  const stepMenu = (e: MouseEvent, p: PlanStep, i: number) => {
    const before = x.steps;
    drop(e, [
      { label: "Move up", onClick: () => set(shift(before, i, -1)) },
      { label: "Move down", onClick: () => set(shift(before, i, 1)) },
      { sep: true, label: "" },
      { label: "Delete", danger: true, onClick: () => (set(before.filter((y) => y.id !== p.id)), toast("Step deleted", { undo: () => set(before) })) },
    ]);
  };
  const folderMenu = (e: MouseEvent) =>
    drop(e, [
      ...live.folders.map((f) => ({ label: f.name, icon: <IconByName name={f.icon ?? "Folder"} size={16} />, onClick: () => A.updateScript(x.id, { folderId: f.id }) })),
      ...(folder ? [{ sep: true, label: "" }, { label: "Unlink folder", onClick: () => A.updateScript(x.id, { folderId: null }) }] : []),
    ]);

  return (
    <div className="mk-plan">
      <div className="mk-plan-inner">
        <section className="tile col" style={{ gap: 8 }} aria-label="Library folder">
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <Folder size={16} className="faint" />
            <span className="headline grow truncate">{folder?.name ?? "No Library folder yet"}</span>
            {live.folders.length > 0 && <button className="btn btn-sm" onClick={folderMenu}>{folder ? "Change" : "Link folder"}</button>}
            <Link className="btn btn-sm btn-ghost" href={folder ? `/library?folder=${folder.id}` : "/library"}>Open Library</Link>
          </div>
          {folder && !files.length && <span className="caption muted">Empty folder. Upload the class materials from the Library.</span>}
          {files.map((f) => (
            <a key={f.id} className="brain-row" href={`/api/resources/files/${f.id}/content`} target="_blank" rel="noreferrer">
              <FileText size={14} />
              <span className="grow truncate">{f.title}</span>
            </a>
          ))}
        </section>

        <ol className="mk-steps">
          {x.steps.map((p, i) => (
            <li key={p.id} className="mk-step">
              <div className="row" style={{ gap: 8 }}>
                <span className="mk-step-n" aria-hidden>{i + 1}</span>
                <input className="input-bare headline grow" value={p.title} placeholder="Step title" aria-label="Step title" onChange={(e) => edit(p.id, { title: e.target.value })} />
                <CopyBtn text={[p.title, p.text].filter(Boolean).join("\n")} what={p.title || "step"} />
                <button className="icon-btn" aria-label={`More for ${p.title || "this step"}`} onClick={(e) => stepMenu(e, p, i)}>
                  <DotsThree size={16} />
                </button>
              </div>
              <textarea className="mk-step-text" value={p.text} placeholder="What happens, what to prepare, what to send" aria-label={`${p.title || "Step"} details`} onChange={(e) => edit(p.id, { text: e.target.value })} />
            </li>
          ))}
        </ol>
        <button className="btn" style={{ alignSelf: "flex-start" }} onClick={add}>
          <Plus size={14} /> Add a day
        </button>
      </div>
    </div>
  );
}
