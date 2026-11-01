"use client";

/**
 * The written conversation with Claude, top of the Brain page. Claude's scheduled runs leave questions
 * here (through brain:do); Jordi's answers land in Firestore, the watcher mirrors them into the Brain's
 * MESSAGES.md, and Claude files them on its next run. Model and rules: lib/hub/brainMessages.ts.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { collection, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { ArrowUp, Brain, Check, X } from "@phosphor-icons/react";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/lib/firebase/AuthContext";
import { byTime, MESSAGES, unprocessed, waitingOnJordi, type BrainMessage } from "@/lib/hub/brainMessages";
import { sfx } from "@/lib/hub/sound";
import { formatDateDMY, nowIso, uid } from "@/lib/hub/util";

export function useBrainMessages(): BrainMessage[] | null {
  const { user } = useAuth();
  const [ms, setMs] = useState<BrainMessage[] | null>(null);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      collection(db, MESSAGES),
      (s) => setMs(s.docs.map((d) => ({ ...d.data(), id: d.id }) as BrainMessage).sort(byTime)),
      () => setMs([])
    );
  }, [user]);
  return ms;
}

/** Questions Claude is waiting on: the badge on the Brain nav item. */
export function useOpenQuestions(): number {
  const ms = useBrainMessages();
  return useMemo(() => (ms ? waitingOnJordi(ms).length : 0), [ms]);
}

const time = (iso: string) => iso.slice(11, 16);
const dayLabel = (iso: string) => `${new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short" })} ${formatDateDMY(iso.slice(0, 10))}`;
const arrive = { initial: { opacity: 0, y: 18, scale: 0.86 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { type: "spring", stiffness: 420, damping: 28 } } as const;

export default function BrainMessages() {
  const ms = useBrainMessages();
  const reduce = useReducedMotion();
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [to, setTo] = useState<string | null | "next">("next"); // a question's id, a free message (null), or the oldest open question
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const all = useMemo(() => ms ?? [], [ms]);
  // Claude's new messages come in one at a time behind a typing indicator, as they do on a phone.
  const incoming = all.find((m) => m.from === "claude" && !m.seenAt && !revealed.has(m.id));
  const shown = useMemo(() => all.filter((m) => m.from !== "claude" || m.seenAt || revealed.has(m.id)), [all, revealed]);
  const open = useMemo(() => waitingOnJordi(all), [all]);
  const answers = useMemo(() => new Map(all.filter((m) => m.replyTo).map((m) => [m.replyTo!, m])), [all]);
  const byId = useMemo(() => new Map(all.map((m) => [m.id, m])), [all]);
  const openShown = open.filter((m) => shown.includes(m));
  const target = to === "next" ? openShown[0] : to ? open.find((m) => m.id === to) : undefined;
  const awaiting = unprocessed(all).length;

  useEffect(() => {
    const id = incoming?.id;
    if (!id) return;
    const t = setTimeout(() => {
      setRevealed((r) => new Set(r).add(id));
      sfx.open();
      updateDoc(doc(db, MESSAGES, id), { seenAt: nowIso() }).catch(() => {});
    }, reduce ? 0 : 1000);
    return () => clearTimeout(t);
  }, [incoming?.id, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce || !shown.length ? "auto" : "smooth" });
  }, [shown.length, !!incoming, reduce]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(text: string, question?: BrainMessage) {
    const clean = text.trim();
    if (!clean) return;
    setError("");
    setDraft("");
    setTo("next");
    sfx.primary();
    const m: Omit<BrainMessage, "id"> = {
      from: "jordi", text: clean, at: nowIso(),
      ...(question ? { replyTo: question.id } : {}),
      ...(question?.about ? { about: question.about } : {}),
      ...(question?.student ? { student: question.student } : {}),
    };
    try {
      await setDoc(doc(db, MESSAGES, uid()), m);
    } catch {
      setDraft(clean);
      setTo(question?.id ?? null); // the retry must answer the same question
      setError("Your message didn't send. It's back in the box.");
    }
  }

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(draft, target);
    }
  };

  return (
    <section className="card span-12 msgs" aria-label="Messages with Claude">
      <header className="msgs-head">
        <span className="msgs-avatar"><Brain size={20} weight="duotone" /></span>
        <div className="col grow" style={{ gap: 0, minWidth: 0 }}>
          <span className="headline">Claude</span>
          <span className="caption muted">{awaiting ? `Will read ${awaiting === 1 ? "your message" : `your ${awaiting} messages`} on the next scheduled run` : "Asks and reads replies on every scheduled run"}</span>
        </div>
        {open.length > 0 && <span className="chip warning">{open.length} to answer</span>}
      </header>

      <div className="msgs-scroll" ref={scroller} role="log" aria-live="polite" aria-label="Conversation">
        {!ms ? (
          <div className="skeleton" style={{ height: 120, width: "100%" }} />
        ) : !all.length ? (
          <p className="msgs-empty">Claude&apos;s questions about your priorities land here after each scheduled run. Answer once and it stays on record.</p>
        ) : (
          <div className="msgs-inner">
            <AnimatePresence initial={false}>
              {shown.map((m, i) => {
                const prev = shown[i - 1];
                const newDay = !prev || prev.at.slice(0, 10) !== m.at.slice(0, 10);
                const quote = m.replyTo && prev?.id !== m.replyTo ? byId.get(m.replyTo) : null;
                return (
                  <motion.div key={m.id} layout="position" className="msg-row">
                    {newDay && <span className="msgs-day">{dayLabel(m.at)}</span>}
                    <motion.div className="msg" data-from={m.from} {...arrive} transition={reduce ? { duration: 0 } : arrive.transition}>
                      {m.from === "claude" && m.ask ? (
                        <QuestionCard
                          m={m}
                          answered={answers.has(m.id)}
                          active={target?.id === m.id}
                          onOption={(o) => send(o, m)}
                          onReply={() => (setTo(m.id), input.current?.focus())}
                        />
                      ) : (
                        <>
                          {quote && <span className="msg-quote">↪ {quote.text}</span>}
                          <div className="bubble">{m.text}</div>
                          <Receipt m={m} isLast={i === shown.length - 1} />
                        </>
                      )}
                    </motion.div>
                  </motion.div>
                );
              })}
              {incoming && (
                <motion.div key="typing" className="msg" data-from="claude" {...arrive} exit={{ opacity: 0, scale: 0.9 }} aria-label="Claude is writing">
                  <div className="msg-typing"><span /><span /><span /></div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      <form className="msgs-composer" onSubmit={(e) => (e.preventDefault(), send(draft, target))}>
        <div className="msgs-composer-inner">
          <AnimatePresence initial={false} mode="popLayout">
            {target && (
              <motion.div key={target.id} className="msgs-replying" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                <span><b>Replying{openShown.length > 1 ? ` · ${openShown.indexOf(target) + 1} of ${openShown.length}` : ""}</b> · {target.about ?? target.text}</span>
                <button type="button" className="icon-btn" aria-label="Send as a new message instead" title="Send as a new message instead" onClick={() => setTo(null)}>
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {error && <span className="caption" role="alert" style={{ color: "var(--danger-ink)" }}>{error}</span>}
          <div className="msgs-field">
            <textarea ref={input} rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} placeholder={target ? "Write your answer" : "Tell Claude something it should know"} aria-label="Message to Claude" />
            {draft.trim() && (
              <motion.button type="submit" className="msgs-send" aria-label="Send" data-sound="none" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} whileTap={{ scale: 0.88 }} transition={{ type: "spring", stiffness: 500, damping: 26 }}>
                <ArrowUp size={16} weight="bold" />
              </motion.button>
            )}
          </div>
        </div>
      </form>
    </section>
  );
}

function QuestionCard({ m, answered, active, onOption, onReply }: { m: BrainMessage; answered: boolean; active: boolean; onOption: (o: string) => void; onReply: () => void }) {
  const state = m.closedAt ? "closed" : answered ? "done" : "open";
  return (
    <div className="msg-card" data-target={active} data-state={state}>
      <div className="msg-card-top">
        <span className="msg-about grow">{m.about ?? "Question"}</span>
        <span className="msg-meta" style={{ padding: 0, flex: "none" }}>{m.source ? `${m.source} · ` : ""}{time(m.at)}</span>
      </div>
      <div className="msg-text">{m.text}</div>
      {state === "open" && (
        <div className="msg-actions">
          {m.options?.map((o) => (
            <button key={o} type="button" className="msg-option" data-sound="none" onClick={() => onOption(o)}>{o}</button>
          ))}
          <button type="button" className="msg-option" data-quiet={!!m.options?.length} onClick={onReply}>{m.options?.length ? "Something else" : "Reply"}</button>
        </div>
      )}
      {state === "closed" && <span className="msg-meta" style={{ padding: 0 }}>No longer needed</span>}
    </div>
  );
}

/** Under each of Jordi's messages: was it read, and what did Claude keep from it. */
function Receipt({ m, isLast }: { m: BrainMessage; isLast: boolean }) {
  if (m.from === "claude") return <span className="msg-meta">{m.source ? `${m.source} · ` : ""}{time(m.at)}</span>;
  return (
    <>
      {m.readAt ? (
        <span className="msg-meta">Read by Claude · {formatDateDMY(m.readAt.slice(0, 10))} {time(m.readAt)}</span>
      ) : (
        isLast && <span className="msg-meta">Delivered · {time(m.at)}</span>
      )}
      {m.learned && (
        <motion.span className="msg-learned" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <Check size={13} weight="bold" style={{ flex: "none", marginTop: 2 }} />
          <span>Saved: {m.learned}</span>
        </motion.span>
      )}
    </>
  );
}
