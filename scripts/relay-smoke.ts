// Phase 0 smoke test for Agent Relay: DM between two companies, the alert
// webhook into #incidents, and the observer stream the screen will use.
import { readEnv } from "./lib/env.ts";
import { relay, RELAY_BASE } from "./lib/relaycast.ts";

const results: [string, boolean, string][] = [];
const check = (name: string, ok: boolean, detail = "") => results.push([name, ok, detail]);

async function main() {
  const shopco = readEnv("shopco").RELAY_AGENT_TOKEN;
  const payflow = readEnv("payflow").RELAY_AGENT_TOKEN;
  const p = readEnv("platform");

  // Open the observer stream first so it can see the messages below.
  const seen: string[] = [];
  const wsUrl = `${RELAY_BASE.replace(/^http/, "ws")}/ws?token=${p.RELAY_OBSERVER_TOKEN}`;
  const ws = new WebSocket(wsUrl);
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(String(ev.data));
      seen.push(msg.type ?? msg.event ?? "unknown");
    } catch {
      seen.push("non-json");
    }
  };
  await new Promise((resolve) => {
    ws.onopen = resolve;
    setTimeout(resolve, 5000);
  });
  check("observer stream connects", ws.readyState === WebSocket.OPEN);

  const stamp = new Date().toISOString();
  const dm = await relay("POST", "/dm", { token: shopco, body: { to: "payflow", text: `smoke test ${stamp}` } });
  check("ShopCo sends DM to PayFlow", Boolean(dm), "");

  const inbox = await relay("GET", "/inbox", { token: payflow });
  // The live API returns unread_dms as a list of conversations (the spec says a count).
  const unread = Array.isArray(inbox.unread_dms) ? inbox.unread_dms.length : Number(inbox.unread_dms ?? 0);
  check("PayFlow inbox shows unread DM", unread > 0, `unread_dms=${JSON.stringify(inbox.unread_dms).slice(0, 160)}`);

  const hook = await fetch(p.RELAY_ALERT_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${p.RELAY_ALERT_WEBHOOK_TOKEN}` },
    body: JSON.stringify({ text: `smoke test alert ${stamp}`, author: "monitor", source: "phase0" }),
  });
  check("webhook posts into #incidents", hook.ok, `HTTP ${hook.status}`);

  const msgs = await relay("GET", "/channels/incidents/messages", { token: shopco });
  const list = Array.isArray(msgs) ? msgs : msgs.messages ?? [];
  check("ShopCo can read the alert in #incidents", list.some((m: any) => String(m.text).includes(stamp)));

  await new Promise((r) => setTimeout(r, 3000));
  ws.close();
  check("observer saw events", seen.length > 0, seen.slice(0, 6).join(", "));

  for (const [name, ok, detail] of results) console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  process.exit(results.every((r) => r[1]) ? 0 : 1);
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
