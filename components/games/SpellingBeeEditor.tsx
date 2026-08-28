"use client";

import { useEffect, useRef, useState } from "react";
import { authFetch } from "@/lib/firebase/authFetch";
import type { SpellingBeeData, SpellingWord } from "@/lib/types";

/**
 * Records a clip via the mic (MediaRecorder — typically produces audio/webm,
 * not literally .mp3, but every browser's <audio> plays it back fine) or
 * accepts an uploaded file of any audio type. Either way the result is
 * POSTed straight to /api/games/{gameId}/audio/{wordId}, which stores it in
 * Firebase Storage and hands back a playable URL — see that route for the
 * storage path/format details.
 */
function AudioField({
  gameId,
  wordId,
  audioUrl,
  onChange,
}: {
  gameId: string;
  wordId: string;
  audioUrl?: string;
  onChange: (audioUrl: string | undefined) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Device labels only populate once mic permission has been granted at
  // least once — before that every entry's `label` is "". Re-running this
  // after a successful getUserMedia() call (see startRecording) is what
  // fills them in without asking the user to do anything extra.
  async function refreshDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === "audioinput"));
    } catch {
      // no device picker if the browser can't list them — Record still works with the default mic
    }
  }

  useEffect(() => {
    void refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
  }, []);

  async function upload(blob: Blob) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", blob, "audio");
      const res = await authFetch(`/api/games/${gameId}/audio/${wordId}`, { method: "POST", body });
      if (!res.ok) {
        const resBody = await res.json().catch(() => ({}));
        setError(resBody.message ?? "Upload failed.");
        return;
      }
      const { audioUrl: url } = (await res.json()) as { audioUrl: string };
      onChange(url);
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      void refreshDevices();
    } catch {
      setError("Couldn't access that microphone.");
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.onstop = () => {
      recorder.stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      void upload(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
    };
    recorder.stop();
  }

  async function remove() {
    setBusy(true);
    try {
      await authFetch(`/api/games/${gameId}/audio/${wordId}`, { method: "DELETE" });
      onChange(undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="audio-field">
      {audioUrl && <audio controls src={audioUrl} className="audio-field-player" />}
      {devices.length > 0 && (
        <select
          className="audio-field-select"
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          disabled={recording || busy}
          title="Microphone"
        >
          <option value="">Default microphone</option>
          {devices.map((d, i) => (
            <option key={d.deviceId || i} value={d.deviceId}>
              {d.label || `Microphone ${i + 1}`}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className={`audio-field-btn${recording ? " recording" : ""}`}
        onClick={recording ? stopRecording : startRecording}
        disabled={busy}
      >
        {recording ? "⏹ Stop" : "🎙 Record"}
      </button>
      <button
        type="button"
        className="audio-field-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={busy || recording}
      >
        📁 Upload
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      {audioUrl && (
        <button type="button" className="audio-field-btn audio-field-remove" onClick={remove} disabled={busy}>
          × Remove
        </button>
      )}
      {error && <span className="repeatable-row-hint" style={{ margin: 0 }}>{error}</span>}
    </div>
  );
}

export default function SpellingBeeEditor({
  gameId,
  data,
  onChange,
}: {
  gameId: string;
  data: SpellingBeeData;
  onChange: (data: SpellingBeeData) => void;
}) {
  function update(id: string, patch: Partial<SpellingWord>) {
    onChange({ words: data.words.map((w) => (w.id === id ? { ...w, ...patch } : w)) });
  }
  function remove(id: string) {
    onChange({ words: data.words.filter((w) => w.id !== id) });
  }
  function add() {
    onChange({ words: [...data.words, { id: crypto.randomUUID(), word: "", hint: "" }] });
  }

  return (
    <div>
      {data.words.map((w) => (
        <div key={w.id} style={{ marginBottom: 14 }}>
          <div className="repeatable-row">
            <div className="repeatable-row-fields">
              <input
                value={w.word}
                placeholder="Word"
                onChange={(e) => update(w.id, { word: e.target.value.toUpperCase() })}
              />
              <input value={w.hint ?? ""} placeholder="Hint (optional)" onChange={(e) => update(w.id, { hint: e.target.value })} />
            </div>
            <button type="button" className="repeatable-row-remove" onClick={() => remove(w.id)}>
              ×
            </button>
          </div>
          <AudioField
            gameId={gameId}
            wordId={w.id}
            audioUrl={w.audioUrl}
            onChange={(audioUrl) => update(w.id, { audioUrl })}
          />
        </div>
      ))}
      <button type="button" className="add-row-btn" onClick={add}>
        + Add word
      </button>
    </div>
  );
}
