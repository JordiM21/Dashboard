"use client";

/**
 * Connections: the integrations hub (Kommo / website form / tuition → Telegram), folded in from the
 * standalone letjunior-hub app. Records live in Upstash Redis, not Firestore; the API is /api/connections.
 */
import { useCallback, useEffect, useState } from "react";
import { Plus, Copy, ArrowsClockwise } from "@phosphor-icons/react";
import { authFetch } from "@/lib/firebase/authFetch";
import { useLive } from "@/lib/hub/live";
import { formatDateDMY } from "@/lib/hub/util";
import { ago } from "@/lib/connections/ago";
import { render, SAMPLE } from "@/lib/connections/template";
import type { Field } from "@/lib/connections/flows/types";
import type { RunLog } from "@/lib/connections/types";
import { toast } from "@/lib/hub/fx";
import { Toolbar } from "../Shell";
import { Empty, Fade, Segmented, Sheet } from "../ui";

type FlowMeta = { type: string; label: string; description: string; needs: string[]; steps: string[]; fields: Field[]; defaults: Record<string, unknown>; actions: { job: string; label: string }[] };
type Conn = { id: string; name: string; type: string; enabled: boolean; config: Record<string, unknown>; secrets: Record<string, string>; last: RunLog | null };
type Detail = Conn & { inboundUrl: string; logs: RunLog[] };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await authFetch(path, init);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.issues?.map((i: { path: string[]; message: string }) => `${i.path.join(".")}: ${i.message}`).join(" · ") || j.error || j.message || `Request failed (${r.status})`);
  return j as T;
}

const STATUS_TONE: Record<string, string> = { sent: "success", error: "danger", ignored: "", duplicate: "" };
const when = (iso: string) => `${formatDateDMY(iso)} ${iso.slice(11, 16)}`;

export default function Connections() {
  const live = useLive();
  const [tab, setTab] = useState<"connections" | "activity">("connections");
  const [data, setData] = useState<{ integrations: Conn[]; flows: FlowMeta[] } | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api<{ integrations: Conn[]; flows: FlowMeta[] }>("/api/connections").then((d) => (setData(d), setErr("")), (e: Error) => setErr(e.message));
  }, []);
  useEffect(() => {
    if (live.mode !== "demo") load();
  }, [live.mode, load]);

  const flip = async (c: Conn) => {
    setData((d) => d && { ...d, integrations: d.integrations.map((x) => (x.id === c.id ? { ...x, enabled: !c.enabled } : x)) });
    await api(`/api/connections/${c.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !c.enabled }) }).catch((e: Error) => toast(e.message, { tone: "danger" }));
    load();
  };

  return (
    <>
      <Toolbar areas={false} title="Connections">
        <Segmented label="View" size="sm" value={tab} onChange={setTab} options={[{ value: "connections", label: "Connections" }, { value: "activity", label: "Activity" }]} />
        {live.mode !== "demo" && (
          <button className="btn" onClick={() => setAdding(true)}>
            <Plus size={14} /> Integration
          </button>
        )}
      </Toolbar>
      <Fade className="canvas" k={tab}>
        {live.mode === "demo" ? (
          <Empty text="Sign in to see and manage your connections." />
        ) : err ? (
          <Empty text={`Couldn't load connections: ${err}`} action="Retry" onAction={load} />
        ) : !data ? (
          <div className="grid-cards">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 132, borderRadius: "var(--r-card)" }} />)}</div>
        ) : tab === "activity" ? (
          <Activity names={Object.fromEntries(data.integrations.map((i) => [i.id, i.name]))} />
        ) : (
          <>
            <p className="callout muted" style={{ marginBottom: 6 }}>Everything that talks to everything else, in one place.</p>
            <div className="grid-cards">
              {data.integrations.map((c) => {
                const state = !c.enabled ? ["", "Paused"] : c.last?.status === "error" ? ["danger", "Needs attention"] : ["success", "Working"];
                return (
                  <div key={c.id} className="card hoverable col" style={{ gap: 10, cursor: "pointer" }} onClick={() => setOpen(c.id)}>
                    <div className="row">
                      <span className="headline grow truncate">{c.name}</span>
                      <Switch on={c.enabled} onChange={() => flip(c)} label={`${c.enabled ? "Pause" : "Resume"} ${c.name}`} />
                    </div>
                    <span className="callout muted">{data.flows.find((f) => f.type === c.type)?.label}</span>
                    <div className="row" style={{ marginTop: "auto" }}>
                      <span className={`chip ${state[0]}`}>{state[1]}</span>
                      <span className="spacer" />
                      <span className="caption muted" title={c.last ? when(c.last.at) : undefined}>{ago(c.last?.at)}</span>
                    </div>
                  </div>
                );
              })}
              <button className="card hoverable callout muted" style={{ minHeight: 132, borderStyle: "dashed" }} onClick={() => setAdding(true)}>
                <Plus size={16} /> Add integration
              </button>
            </div>
          </>
        )}
      </Fade>

      {data && <DetailSheet id={open} flows={data.flows} onClose={() => setOpen(null)} onChanged={load} />}
      {data && (
        <NewSheet
          open={adding}
          flows={data.flows}
          onClose={() => setAdding(false)}
          onCreated={(id) => {
            setAdding(false);
            load();
            setOpen(id);
          }}
        />
      )}
    </>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="switch"
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
    >
      <span />
    </button>
  );
}

function LogRows({ logs, names }: { logs: RunLog[]; names?: Record<string, string> }) {
  if (!logs.length) return <span className="callout muted">Nothing yet.</span>;
  return (
    <table className="table">
      <tbody>
        {logs.map((l) => (
          <tr key={l.id}>
            <td style={{ width: 1, whiteSpace: "nowrap" }}>
              <span className={`chip ${STATUS_TONE[l.status] ?? ""}`}>{l.status}</span>
            </td>
            <td>
              {names && <div className="callout">{names[l.integrationId] ?? "Deleted integration"}</div>}
              <div className="caption muted" style={{ wordBreak: "break-word" }}>
                {l.leadId ? `Lead ${l.leadId}${l.detail ? " · " : ""}` : ""}
                {l.detail}
              </div>
            </td>
            <td className="caption muted" style={{ textAlign: "right", whiteSpace: "nowrap" }} title={when(l.at)}>
              {ago(l.at)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Activity({ names }: { names: Record<string, string> }) {
  const [status, setStatus] = useState<"" | "sent" | "ignored" | "duplicate" | "error">("");
  const [logs, setLogs] = useState<RunLog[] | null>(null);
  useEffect(() => {
    setLogs(null);
    api<RunLog[]>(`/api/connections/logs${status ? `?status=${status}` : ""}`).then(setLogs, (e: Error) => (toast(e.message, { tone: "danger" }), setLogs([])));
  }, [status]);
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Segmented label="Status" size="sm" value={status} onChange={setStatus} options={[{ value: "", label: "All" }, { value: "sent", label: "Sent" }, { value: "ignored", label: "Ignored" }, { value: "duplicate", label: "Duplicate" }, { value: "error", label: "Error" }]} />
        <span className="spacer" />
        {logs && <span className="caption muted">{logs.length} runs</span>}
      </div>
      <section className="card">{logs ? <LogRows logs={logs} names={names} /> : <div className="skeleton" style={{ height: 160 }} />}</section>
    </>
  );
}

function DetailSheet({ id, flows, onClose, onChanged }: { id: string | null; flows: FlowMeta[]; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const load = useCallback(() => {
    if (id) api<Detail>(`/api/connections/${id}`).then(setD, (e: Error) => toast(e.message, { tone: "danger" }));
  }, [id]);
  useEffect(() => {
    setD(null);
    load();
  }, [load]);
  const flow = d && flows.find((f) => f.type === d.type);
  const refresh = () => (load(), onChanged());

  return (
    <Sheet open={!!id} onClose={onClose} wide label={d?.name ?? "Integration"}>
      {!d || !flow ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : (
        <>
          <div className="row">
            <h2 className="title grow">{d.name}</h2>
            <Switch on={d.enabled} label={d.enabled ? "Pause" : "Resume"} onChange={() => api(`/api/connections/${d.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !d.enabled }) }).then(refresh, (e: Error) => toast(e.message, { tone: "danger" }))} />
          </div>
          <p className="callout muted">{flow.description}</p>
          <details className="tile">
            <summary className="callout" style={{ cursor: "pointer" }}>
              How to set it up
            </summary>
            <Steps flow={flow} />
          </details>
          <ConnectionForm key={d.id} flow={flow} existing={d} onSaved={refresh} />
          <div className="label">Recent activity</div>
          <LogRows logs={d.logs} />
        </>
      )}
    </Sheet>
  );
}

function NewSheet({ open, flows, onClose, onCreated }: { open: boolean; flows: FlowMeta[]; onClose: () => void; onCreated: (id: string) => void }) {
  const [type, setType] = useState("");
  useEffect(() => {
    if (open) setType(flows.length === 1 ? flows[0].type : "");
  }, [open, flows]);
  const flow = flows.find((f) => f.type === type);
  return (
    <Sheet open={open} onClose={onClose} wide label="Add integration">
      <h2 className="title">Add integration</h2>
      {!flow ? (
        <>
          <p className="callout muted">Pick what should happen. Each one gives you a private address that the other app sends its data to, and you get a Telegram message.</p>
          <div className="grid-cards" style={{ paddingTop: 0 }}>
            {flows.map((f) => (
              <button key={f.type} className="tile col" style={{ gap: 6, textAlign: "left", alignItems: "flex-start", cursor: "pointer" }} onClick={() => setType(f.type)}>
                <span className="headline">{f.label}</span>
                <span className="caption muted">{f.description}</span>
                <span className="caption" style={{ marginTop: 4 }}>You’ll need</span>
                <ul className="caption muted" style={{ margin: 0, paddingLeft: 16 }}>
                  {f.needs.map((n) => <li key={n}>{n}</li>)}
                </ul>
              </button>
            ))}
          </div>
          <div className="tile col" style={{ gap: 6 }}>
            <span className="headline">Something else?</span>
            <span className="caption muted">
              If the other app can send a webhook (look for “Webhooks”, “Notifications” or “Send to URL” in its settings), use <b>Any app → Telegram</b>: it works with Zapier, Make, Stripe, Calendly, Tally, Typeform and most tools.
              If you need the hub to read from or write to another app (for example, create a Google Calendar event or reply on WhatsApp), that’s a new preset: ask Claude in this project to “add a connection flow for &lt;app&gt;”. It’s one file in lib/connections/flows and appears here automatically.
            </span>
          </div>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setType("")}>
            ← All types
          </button>
          <p className="callout muted">
            {flow.label}. {flow.description}
          </p>
          <div className="tile">
            <span className="callout">How to set it up</span>
            <Steps flow={flow} />
          </div>
          <ConnectionForm key={flow.type} flow={flow} onCreated={onCreated} />
        </>
      )}
    </Sheet>
  );
}

function Steps({ flow }: { flow: FlowMeta }) {
  return (
    <ol className="callout muted col" style={{ gap: 6, margin: "10px 0 0", paddingLeft: 20 }}>
      {flow.steps.map((s) => <li key={s}>{s}</li>)}
    </ol>
  );
}

const toText = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v ?? ""));

/** One input per flow field — no per-integration UI code (the flow's `fields` drive it). */
function ConnectionForm({ flow, existing, onSaved, onCreated }: { flow: FlowMeta; existing?: Detail; onSaved?: () => void; onCreated?: (id: string) => void }) {
  const { fields } = flow;
  const [name, setName] = useState(existing?.name ?? flow.label);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.filter((f) => f.kind === "config").map((f) => [f.key, toText(existing?.config[f.key] ?? flow.defaults[f.key])])));
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [stages, setStages] = useState<{ id: string; label: string }[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ ok: boolean; text: string }>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await fn());
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Something went wrong. Try again." });
    }
    setBusy(false);
  }

  const save = (extra: object = {}) =>
    run(async () => {
      const body = {
        type: flow.type,
        name,
        secrets,
        config: Object.fromEntries(fields.filter((f) => f.kind === "config").map((f) => [f.key, f.list ? values[f.key].split(",").map((s) => s.trim()).filter(Boolean) : values[f.key]])),
        ...extra,
      };
      const j = await api<{ id: string; warning?: string }>(existing ? `/api/connections/${existing.id}` : "/api/connections", { method: existing ? "PATCH" : "POST", body: JSON.stringify(body) });
      setSecrets({});
      if (!existing) onCreated?.(j.id);
      else onSaved?.();
      return { ok: !j.warning, text: j.warning ?? "Saved" };
    });

  const test = (b: { alert?: boolean; job?: string }) =>
    run(async () => {
      const j = await api<{ ok: boolean; message: string }>(`/api/connections/${existing!.id}/test`, { method: "POST", body: JSON.stringify(b) });
      onSaved?.();
      return { ok: j.ok, text: j.message };
    });

  const detect = () =>
    run(async () => {
      const j = await api<{ stages: { id: string; label: string }[] }>("/api/connections/kommo-stages", {
        method: "POST",
        body: JSON.stringify({ integrationId: existing?.id, kommoSubdomain: values.kommoSubdomain, kommoToken: secrets.kommoToken }),
      });
      setStages(j.stages);
      return { ok: true, text: `Found ${j.stages.length} stages. Pick Human Handoff.` };
    });

  const set = (k: string, v: string) => setValues({ ...values, [k]: v });

  return (
    <form
      className="col"
      style={{ gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="field">
        <span>Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>

      {fields.map((f) => (
        <div key={f.key} className="field">
          <label htmlFor={`f-${f.key}`} style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)" }}>
            {f.label}
          </label>
          {f.kind === "secret" ? (
            <input id={`f-${f.key}`} className="input" type="password" autoComplete="off" value={secrets[f.key] ?? ""} onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })} placeholder={existing?.secrets[f.key] ? `${existing.secrets[f.key]} (leave blank to keep)` : ""} />
          ) : f.multiline ? (
            <>
              <textarea id={`f-${f.key}`} className="textarea mono" rows={6} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
              <span className="caption muted">Preview</span>
              <pre className="tile mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{render(values[f.key], SAMPLE)}</pre>
            </>
          ) : f.detect && stages.length ? (
            <select id={`f-${f.key}`} className="select" value={values[f.key]} onChange={(e) => set(f.key, e.target.value)}>
              <option value="">Choose a stage…</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : (
            <input id={`f-${f.key}`} className="input" value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
          )}
          <span className="caption muted">{f.hint}</span>
          {f.detect && (
            <button type="button" className="btn btn-sm" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={detect}>
              Detect stages
            </button>
          )}
        </div>
      ))}

      <div className="row" style={{ flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {existing ? "Save changes" : "Create integration"}
        </button>
        {existing && (
          <>
            <button type="button" className="btn" disabled={busy} onClick={() => test({ alert: false })}>
              Test connection
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => test({ alert: true })}>
              Send a test alert
            </button>
            {flow.actions.map((a) => (
              <button key={a.job} type="button" className="btn" disabled={busy} onClick={() => test({ job: a.job })}>
                {a.label}
              </button>
            ))}
          </>
        )}
      </div>
      {msg && (
        <p role="status" className={`chip ${msg.ok ? "success" : "danger"}`} style={{ height: "auto", padding: "6px 10px", whiteSpace: "normal", alignSelf: "flex-start" }}>
          {msg.text}
        </p>
      )}

      {existing && (
        <details className="tile" open={!existing.logs.length}>
          <summary className="callout" style={{ cursor: "pointer" }}>
            Inbound address
          </summary>
          <div className="col" style={{ gap: 10, marginTop: 12 }}>
            <span className="caption muted">Paste this address into the app that sends the data (see “How to set it up” above). Treat it like a password: anyone with it can send you messages.</span>
            <input className="input mono" readOnly value={existing.inboundUrl} onFocus={(e) => e.currentTarget.select()} />
            <div className="row">
              <button type="button" className="btn btn-sm" onClick={() => navigator.clipboard.writeText(existing.inboundUrl).then(() => toast("Address copied"))}>
                <Copy size={12} /> Copy
              </button>
              <button type="button" className="btn btn-sm btn-danger" disabled={busy} onClick={() => confirm("The old address stops working. Continue?") && save({ regenerateSecret: true })}>
                <ArrowsClockwise size={12} /> Regenerate
              </button>
            </div>
          </div>
        </details>
      )}
    </form>
  );
}
