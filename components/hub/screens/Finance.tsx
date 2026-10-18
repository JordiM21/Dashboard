"use client";

/** Finance (§5.6, §6): the KPI row is the focal point; ledger as list + detail; business by default. */
import { useMemo, useState } from "react";
import { CaretDown, Plus, X, ArrowDownLeft, ArrowUpRight, CheckSquare } from "@phosphor-icons/react";
import { useHub } from "@/lib/hub/store";
import { useLive } from "@/lib/hub/live";
import * as A from "@/lib/hub/actions";
import { adSpend, costPerStudent, ledger, monthNet, mrr, newPaying, receivables, type LedgerRow } from "@/lib/hub/metrics";
import { formatDateDMY, money, monthKey, monthName, prevMonth, today } from "@/lib/hub/util";
import { Toolbar, useShell } from "../Shell";
import { PillBars } from "./Goals";
import { Empty, Fade, Kpi, Money, Segmented, Sheet, useDropdown, Check } from "../ui";

export default function Finance() {
  const s = useHub();
  const live = useLive();
  const { inspect, mobile } = useShell();
  const drop = useDropdown();
  const scope = s.ui.finScope;
  const all = useMemo(() => ledger(live, s), [live, s]);
  const cur = monthKey();
  const [month, setMonth] = useState<string>("");
  const [type, setType] = useState<"all" | "in" | "out">("all");
  const [student, setStudent] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const m = mrr(live, s);
  const net = monthNet(all, cur, scope);
  const prevNet = monthNet(all, prevMonth(cur), scope);
  const rec = receivables(live, s);
  const recSum = rec.reduce((a, r) => a + r.amount, 0);
  const cps = costPerStudent(live, s);
  const spend = adSpend(live, s, cur);
  const months = Array.from({ length: 6 }, (_, i) => prevMonth(cur, 5 - i));

  const rows = all.filter((r) => (scope === "all" || r.scope === scope) && (!month || r.date.startsWith(month)) && (type === "all" || (type === "in" ? r.amount > 0 : r.amount < 0)) && (!student || r.studentId === student));
  const selected = rows.find((r) => r.id === sel) ?? rows[0];
  const activeFilters = (month ? 1 : 0) + (type !== "all" ? 1 : 0) + (student ? 1 : 0);

  const cats = useMemo(() => {
    const out = new Map<string, { now: number; last: number }>();
    for (const r of all) {
      if (r.amount >= 0 || (scope !== "all" && r.scope !== scope)) continue;
      const k = r.date.startsWith(cur) ? "now" : r.date.startsWith(prevMonth(cur)) ? "last" : null;
      if (!k) continue;
      const c = out.get(r.category) ?? { now: 0, last: 0 };
      c[k] += -r.amount;
      out.set(r.category, c);
    }
    return [...out.entries()].sort((a, b) => b[1].now - a[1].now);
  }, [all, scope, cur]);

  const delta = (a: number, b: number) => (b ? { value: `${a >= b ? "+" : "−"}${Math.abs(Math.round(((a - b) / Math.abs(b)) * 100))}%`, up: a >= b } : null);

  return (
    <>
      <Toolbar areas={false} title="Finance">
        <Segmented label="Scope" size="sm" value={scope} onChange={(v) => A.setUi({ finScope: v })} options={[{ value: "business", label: "Business" }, { value: "personal", label: "Personal" }, { value: "all", label: "Combined" }]} />
        <button className="btn" onClick={() => setAdding(true)}>
          <Plus size={14} /> Expense
        </button>
      </Toolbar>
      <Fade className="canvas">
        <section className="card" style={{ padding: 28, marginBottom: 16 }} aria-label="Key numbers">
          <div className="bento" style={{ gap: 28 }}>
            <div className="span-3">
              <Kpi label="MRR" hint="Sum of active students' monthly price" foot={<span className="caption muted">${money(1500 - m)} to the $1,500 goal</span>}>
                <Money value={m} id="fin-mrr" />
              </Kpi>
            </div>
            <div className="span-3">
              <Kpi label={`Net · ${monthName(cur)}`} delta={delta(net.net, prevNet.net)} foot={<span className="caption muted">${money(net.income)} in · ${money(net.expense)} out</span>}>
                <Money value={net.net} id="fin-net" />
              </Kpi>
            </div>
            <div className="span-3">
              <Kpi label="Overdue receivables" foot={<span className="caption muted">{rec.length} student{rec.length === 1 ? "" : "s"} to chase today</span>}>
                <Money value={recSum} id="fin-rec" />
              </Kpi>
            </div>
            <div className="span-3">
              <Kpi
                label="Cost per enrolled student"
                foot={
                  <span className="caption muted row" style={{ gap: 4 }}>
                    Ad spend $
                    <input className="input-bare caption" style={{ width: 56, borderBottom: "1px dashed var(--line-strong)" }} type="number" value={Math.round(spend)} onChange={(e) => A.setAdSpend(cur, Number(e.target.value))} aria-label="Ad spend this month" />÷ {newPaying(live, s, cur).length} new
                  </span>
                }
              >
                {cps == null ? <span className="display-l faint">—</span> : <Money value={cps} id="fin-cps" />}
              </Kpi>
            </div>
          </div>
        </section>

        <div className="row" style={{ marginBottom: 12, flexWrap: "wrap" }}>
          <button className="filter-pill" data-active={!!month} onClick={(e) => drop(e, [{ label: "All months", onClick: () => setMonth("") }, ...[...months].reverse().map((mm) => ({ label: `${monthName(mm)} ${mm.slice(0, 4)}`, hint: month === mm ? "✓" : "", onClick: () => setMonth(mm) }))])}>
            Month: <b>{month ? monthName(month) : "All"}</b> <CaretDown size={12} />
          </button>
          <button className="filter-pill" data-active={type !== "all"} onClick={(e) => drop(e, [{ label: "All", onClick: () => setType("all") }, { label: "Income", onClick: () => setType("in") }, { label: "Expenses", onClick: () => setType("out") }])}>
            Type: <b>{type === "all" ? "All" : type === "in" ? "Income" : "Expenses"}</b> <CaretDown size={12} />
          </button>
          <button className="filter-pill" data-active={!!student} onClick={(e) => drop(e, [{ label: "Any student", onClick: () => setStudent("") }, ...live.students.map((x) => ({ label: x.name, onClick: () => setStudent(x.id) }))])}>
            Student: <b>{live.students.find((x) => x.id === student)?.name ?? "Any"}</b> <CaretDown size={12} />
          </button>
          {activeFilters > 0 && (
            <>
              <span className="badge-count">{activeFilters}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => (setMonth(""), setType("all"), setStudent(""))}>
                <X size={12} /> Clear
              </button>
            </>
          )}
          <span className="spacer" />
          <span className="caption muted">{rows.length} entries</span>
        </div>

        <div className="list-detail" style={{ marginBottom: 16 }}>
          <div className="card ld-list" role="listbox" aria-label="Ledger">
            {rows.length === 0 && <Empty text="No entries match." />}
            {rows.slice(0, 200).map((r) => (
              <button key={r.id} className="ld-row" role="option" aria-selected={r.id === selected?.id} onClick={() => (mobile ? inspect({ kind: "tx", id: r.id }) : setSel(r.id))}>
                <span className="avatar" style={{ width: 28, height: 28, color: r.amount > 0 ? "var(--success-ink)" : "var(--text-2)" }}>
                  {r.amount > 0 ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                </span>
                <span className="grow col" style={{ gap: 0, minWidth: 0 }}>
                  <span className="truncate callout" style={{ fontWeight: 500 }}>
                    {r.description}
                  </span>
                  <span className="caption muted">
                    {formatDateDMY(r.date)} · {r.category}
                  </span>
                </span>
                <span className="callout" style={{ fontWeight: 600, color: r.amount > 0 ? "var(--success-ink)" : undefined }}>
                  {r.amount > 0 ? "+" : "−"}${money(Math.abs(r.amount), 2)}
                </span>
              </button>
            ))}
          </div>
          <div className="card">{selected ? <Detail r={selected} /> : <Empty text="Select an entry." />}</div>
        </div>

        <div className="bento">
          <section className="card span-6" aria-label="Receivables">
            <div className="card-head">
              <span className="headline">Receivables</span>
              <span className="chip">{rec.length}</span>
            </div>
            {rec.length === 0 && <span className="callout faint">Everyone is paid up.</span>}
            {rec.map((r) => (
              <div key={r.student.id} className="task-row">
                <button className="grow" style={{ textAlign: "left" }} onClick={() => inspect({ kind: "student", id: r.student.id })}>
                  <b>{r.student.name}</b> <span className="muted callout">· ${r.amount}</span>
                </button>
                <span className={`chip ${r.status === "late" ? "danger" : "warning"}`}>{r.days}d overdue</span>
                <button className="btn btn-sm btn-ghost" onClick={() => A.addTask({ title: `Follow up with ${r.student.name}'s parent`, areaId: "let", priority: 1, due: today(), studentId: r.student.id, notes: `$${r.amount} · ${r.days} days overdue` })}>
                  <CheckSquare size={14} /> Follow-up
                </button>
              </div>
            ))}
          </section>
          <section className="card span-6" aria-label="Expenses by category">
            <div className="card-head">
              <span className="headline">Top expense categories</span>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th className="label">Category</th>
                  <th className="label num">{monthName(cur)}</th>
                  <th className="label num">{monthName(prevMonth(cur))}</th>
                </tr>
              </thead>
              <tbody>
                {cats.slice(0, 8).map(([c, v]) => (
                  <tr key={c}>
                    <td>{c}</td>
                    <td className="num">${money(v.now, 2)}</td>
                    <td className="num muted">
                      ${money(v.last, 2)} {v.last > 0 && v.now > v.last * 1.1 && <span className="delta down">↑</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cats.length === 0 && <span className="callout faint">No expenses this month or last.</span>}
          </section>
          <section className="card span-12" aria-label="Net by month">
            <div className="card-head">
              <span className="headline">Net by month</span>
              <span className="caption muted">last 6 months · {scope === "all" ? "combined" : scope}</span>
            </div>
            <PillBars data={months.map((mm) => ({ label: monthName(mm), value: Math.max(0, monthNet(all, mm, scope).net) }))} fmt={(n) => `$${money(n)}`} />
          </section>
        </div>
      </Fade>
      <AddExpense open={adding} onClose={() => setAdding(false)} defaultScope={scope === "personal" ? "personal" : "business"} />
    </>
  );
}

function Detail({ r }: { r: LedgerRow }) {
  const live = useLive();
  const { inspect } = useShell();
  const st = live.students.find((x) => x.id === r.studentId);
  const t = r.raw;
  return (
    <div className="col" style={{ gap: 18 }}>
      <span className="label">{r.raw ? "Transaction" : "Expense"}</span>
      <Money value={r.amount} digits={2} className="display-xl" />
      <div className="prop-grid">
        <span>Description</span>
        <span>{r.description}</span>
        <span>Date</span>
        <span>{formatDateDMY(r.date)}</span>
        <span>Category</span>
        <span>{r.category}</span>
        <span>Source</span>
        <span style={{ textTransform: "capitalize" }}>{r.source}</span>
        <span>Scope</span>
        <span>{r.scope === "business" ? "Business" : "Personal"}</span>
        {t?.originalCurrency && (
          <>
            <span>Charged</span>
            <span>
              {money(t.originalAmount ?? 0)} {t.originalCurrency.toUpperCase()} · rate {t.exchangeRate}
            </span>
          </>
        )}
        {t && (
          <>
            <span>Payer</span>
            <span>{t.payerEmail ?? "—"}</span>
            <span>Student</span>
            <span>{st ? <button style={{ color: "var(--accent)" }} onClick={() => inspect({ kind: "student", id: st.id })}>{st.name}</button> : <span className="faint">Not linked</span>}</span>
          </>
        )}
      </div>
      {t?.source === "stripe" && <p className="caption faint">Stripe entries are read-only and arrive through the webhook, which also advances the student’s due date and emails the parent.</p>}
    </div>
  );
}

function AddExpense({ open, onClose, defaultScope }: { open: boolean; onClose: () => void; defaultScope: "business" | "personal" }) {
  const [f, setF] = useState({ description: "", amount: "", category: "Software", date: today(), scope: defaultScope, recurring: false });
  return (
    <Sheet open={open} onClose={onClose} label="Add expense">
      <h2 className="title">Add expense</h2>
      <form
        className="col"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!f.description || !f.amount) return;
          A.addExpense({ ...f, amount: Number(f.amount), archivedAt: null });
          setF({ ...f, description: "", amount: "" });
          onClose();
        }}
      >
        <Segmented label="Scope" size="sm" value={f.scope} onChange={(v) => setF({ ...f, scope: v })} options={[{ value: "business", label: "Business" }, { value: "personal", label: "Personal" }]} />
        <label className="field">
          <span>Description</span>
          <input className="input" autoFocus value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </label>
        <div className="row">
          <label className="field grow">
            <span>Amount (USD)</span>
            <input className="input" type="number" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </label>
          <label className="field grow">
            <span>Category</span>
            <input className="input" list="cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
            <datalist id="cats">
              {["Ads", "Software", "Materials", "Rent", "Food", "Transport", "Fun"].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="field grow">
            <span>Date</span>
            <input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </label>
        </div>
        <label className="row callout">
          <Check square checked={f.recurring} label="Recurring" onChange={() => setF({ ...f, recurring: !f.recurring })} /> Recurring monthly — next entry is created on the 1st
        </label>
        <div className="row">
          <span className="caption faint grow">Stripe income keeps flowing in automatically.</span>
          <button className="btn btn-primary">Add</button>
        </div>
      </form>
    </Sheet>
  );
}
