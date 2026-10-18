// Telegram Bot API over JSON POST (token stays out of query strings; plain text, no parse_mode).
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(token: string, method: string, body: object = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
      if (r.status < 500) {
        const j = await r.json();
        if (!j.ok) throw new Error(`Telegram: ${j.description ?? r.status}`);
        return j.result;
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Telegram:")) throw e; // 4xx: retrying won't help
    }
    if (attempt === 0) await sleep(1000); // one retry on network error / 5xx
  }
  throw new Error("Telegram unreachable");
}

export const sendMessage = (token: string, chatId: string, text: string, noPreview = false) =>
  call(token, "sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    ...(noPreview && { link_preview_options: { is_disabled: true } }),
  });

export const getMe = (token: string) => call(token, "getMe");
