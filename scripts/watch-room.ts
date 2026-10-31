// Window 4: the Agent Relay room, live. Prints every message between the companies'
// agents in their colors, read from Agent Relay's observer stream.
//   npx tsx scripts/watch-room.ts
import { readEnv } from "./lib/env.ts";
import { RELAY_BASE } from "./lib/relaycast.ts";

const env = readEnv("platform");
const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[41m\x1b[97m", grey: "\x1b[90m" };
const COLOR: Record<string, string> = { shopco: "\x1b[94m", payflow: "\x1b[92m", shieldco: "\x1b[93m", monitor: "\x1b[91m" };
const paint = (who: string) => `${C.bold}${COLOR[who] ?? ""}${who}${C.reset}`;

function header() {
  console.clear();
  console.log(`${C.bold}AGENT RELAY ROOM${C.reset}  ${C.grey}workspace bridge-hauntedhacks · live${C.reset}`);
  console.log(`${paint("shopco")} store (Codex)   ${paint("payflow")} payments (Claude Code)   ${paint("shieldco")} fraud checks (Gemini)\n`);
}

function show(raw: any) {
  if (process.env.DEBUG) console.log(JSON.stringify(raw).slice(0, 400));
  const msg = raw.message ?? raw.data?.message ?? raw.data ?? raw;
  const text: string = msg?.text ?? "";
  if (!text) return;
  const jsonLine = text.split("\n").find((l) => l.trim().startsWith("{"));
  let env: any = null;
  if (jsonLine) try { env = JSON.parse(jsonLine); } catch {}
  const time = new Date().toLocaleTimeString();

  if (env?.event === "POLICY_BLOCKED") {
    console.log(`\n${C.red} ${time}  POLICY BLOCKED  ${C.reset} ${paint(env.company)} tried to send a ${C.bold}${env.field}${C.reset} to ${env.to}. Not sent.\n`);
    return;
  }
  const from = env?.from ?? msg?.agent_name ?? "?";
  const to = env?.to ?? (msg?.channel_name ? `#${msg.channel_name}` : "?");
  const type = env?.type ? `${C.bold}[${env.type}]${C.reset} ` : "";
  const body = (env?.text ?? text.split("\n")[0].replace(/^\[[A-Z_]+\]\s*/, "")).slice(0, 220);
  const extra = env?.data?.pr ? `\n           ${C.grey}PR ${env.data.pr}${C.reset}` : env?.data?.request_ids ? `\n           ${C.grey}ids ${env.data.request_ids.slice(0, 4).join(", ")}${C.reset}` : "";
  const toLabel = String(to).startsWith("#") ? `${C.dim}${to}${C.reset}` : paint(String(to));
  console.log(`${C.grey}${time}${C.reset}  ${paint(from)} ──▶ ${toLabel}  ${type}${body}${extra}`);
}

function connect() {
  const ws = new WebSocket(`${RELAY_BASE.replace(/^http/, "ws")}/ws?token=${env.RELAY_OBSERVER_TOKEN}`);
  ws.onopen = () => console.log(`${C.grey}connected to Agent Relay · waiting for agents…${C.reset}\n`);
  ws.onmessage = (ev) => {
    try { show(JSON.parse(String(ev.data))); } catch {}
  };
  ws.onclose = () => { console.log(`${C.grey}reconnecting…${C.reset}`); setTimeout(connect, 2000); };
  ws.onerror = () => {};
}

header();
connect();
