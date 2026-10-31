// Platform: demo store website, fault panel, traffic, monitor and the demo screen.
// Not a company. No company agent ever works in this repo.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { readEnv } from "../scripts/lib/env.ts";
import { roomEnabled, roomError, roomOpen, roomRecord, roomReset, roomSocket, roomState } from "./incident-room.ts";

const ROOT = join(import.meta.dirname, "..");
const env = readEnv("platform");
const PORT = Number(process.env.PORT ?? 3000);
// Each company runs on its own Freestyle VM when its URL is set; otherwise on this laptop.
const SHOPCO = env.SHOPCO_URL || "http://localhost:4001";
const COMPANY_ADMIN: Record<string, string> = {
  shopco: SHOPCO,
  payflow: env.PAYFLOW_URL || "http://localhost:4002",
  shieldco: env.SHIELDCO_URL || "http://localhost:4003",
};
const RELAY_BASE = "https://cast.agentrelay.com/v1";

// Faults the judge can switch on. Each one is a config change inside one company.
const FAULTS: Record<string, { label: string; broken: Record<string, unknown>; healthy: Record<string, unknown> }> = {
  payflow: { label: "PayFlow (payments)", broken: { amount_unit: "cents" }, healthy: { amount_unit: "dollars" } },
};

type Order = { order_id: string; product_id: string; amount: number; status: string; error_code: string | null; request_id: string; created_at: string; recovered?: boolean };
type Incident = { id: string; status: "open" | "investigating" | "root_cause" | "fixing" | "recovering" | "resolved"; opened_at: string; first_failures: string[]; banner: string };

let incident: Incident | null = null;
let baseline = new Date().toISOString(); // impact counter counts orders after this
let trafficMode: "off" | "normal" | "burst" = "off";
let banner = "All systems normal";
const relayEvents: any[] = [];

// ---------- live updates to the screen (Server-Sent Events) ----------
const clients = new Set<ServerResponse>();
function push(type: string, data: unknown): void {
  const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.write(line);
}

async function orders(): Promise<Order[]> {
  const res = await fetch(`${SHOPCO}/orders`, { signal: AbortSignal.timeout(3000) });
  return (await res.json()) as Order[];
}

function impact(list: Order[]) {
  const recent = list.filter((o) => o.created_at >= baseline);
  const failed = recent.filter((o) => o.status === "failed");
  const recovered = recent.filter((o) => o.recovered);
  const sum = (xs: Order[]) => Math.round(xs.reduce((s, o) => s + o.amount, 0) * 100) / 100;
  return {
    orders: recent.length,
    paid: recent.filter((o) => o.status === "paid").length,
    failed: failed.length,
    lost: sum(failed),
    recovered: recovered.length,
    recovered_amount: sum(recovered),
  };
}

function snapshot(list: Order[] = []) {
  return { incident, banner, trafficMode, impact: impact(list), recent: list.slice(-12).reverse(), faults: faultState };
}

// ---------- monitor: notices failures and alerts ShopCo's agent ----------
async function postAlert(text: string): Promise<void> {
  if (!env.RELAY_ALERT_WEBHOOK_URL) return;
  // Retry while Agent Relay is busy so the alert is never lost.
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(env.RELAY_ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.RELAY_ALERT_WEBHOOK_TOKEN}` },
      body: JSON.stringify({ text, author: "monitor", source: "bridge-monitor" }),
    }).catch(() => null);
    if (res?.ok) return;
    await new Promise((r) => setTimeout(r, attempt * 1000));
  }
  console.error("alert failed after retries");
}

async function monitorTick(): Promise<void> {
  let list: Order[];
  try {
    list = await orders();
  } catch {
    return;
  }
  const windowStart = new Date(Date.now() - 30_000).toISOString();
  const recentFailures = list.filter((o) => o.status === "failed" && o.created_at >= windowStart);
  if (!incident && recentFailures.length >= 3) {
    const newId = `inc_${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "")}`;
    // The Incident Room actor decides: one open incident, however many alerts arrive
    // (even after this server restarts and forgets its own state).
    const opened: any = await roomOpen(newId, recentFailures.length);
    if (opened && opened.opened === false) {
      const s: any = await roomState();
      incident = { id: opened.incidentId, status: s?.status ?? "open", opened_at: s?.openedAt ?? new Date().toISOString(), first_failures: [], banner: "" };
      banner = `Incident ${opened.incidentId} still open (restored from the Incident Room)`;
      push("state", snapshot(list));
      return;
    }
    const id = newId;
    const deepest = recentFailures[recentFailures.length - 1].error_code;
    incident = { id, status: "open", opened_at: new Date().toISOString(), first_failures: recentFailures.slice(0, 5).map((o) => o.request_id), banner: "" };
    banner = `Incident opened: ${recentFailures.length} failed checkouts in 30 seconds`;
    const alert = {
      bridge: 1, from: "monitor", to: "#incidents", type: "INCIDENT_OPENED", incident_id: id, company: "shopco",
      window_s: 30, failed: recentFailures.length, sample_request_ids: incident.first_failures,
      sample_order_ids: recentFailures.slice(0, 5).map((o) => o.order_id), error_code: deepest, opened_at: incident.opened_at,
    };
    await postAlert(`[INCIDENT_OPENED] ShopCo checkout failures: ${recentFailures.length} in the last 30s (error ${deepest}). ShopCo leads.\n${JSON.stringify(alert)}`);
    console.log(`incident ${id} opened`);
  }
  push("state", snapshot(list));
}

// ---------- traffic generator: simulated shoppers ----------
const PRODUCT_IDS = ["hoodie", "tee", "beanie", "tote", "wallet", "mug", "coffee", "coffee", "backpack", "headphones", "notebook"];
async function trafficTick(): Promise<void> {
  if (trafficMode === "off") return;
  const product_id = PRODUCT_IDS[Math.floor(Math.random() * PRODUCT_IDS.length)];
  const customer_email = `c-${Math.floor(1000 + Math.random() * 9000)}@example.com`;
  await fetch(`${SHOPCO}/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ product_id, customer_email }),
  }).catch(() => {});
}
let trafficTimer: NodeJS.Timeout | undefined;
function setTraffic(mode: typeof trafficMode): void {
  trafficMode = mode;
  clearInterval(trafficTimer);
  if (mode !== "off") trafficTimer = setInterval(trafficTick, mode === "burst" ? 1000 : 3000);
}

// ---------- faults ----------
const faultState: Record<string, boolean> = { payflow: false };
async function setFault(company: string, broken: boolean): Promise<void> {
  const f = FAULTS[company];
  if (!f) throw new Error(`no fault for ${company}`);
  const res = await fetch(`${COMPANY_ADMIN[company]}/__admin/config`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-token": env.ADMIN_TOKEN },
    body: JSON.stringify(broken ? f.broken : f.healthy),
  });
  if (!res.ok) throw new Error(`admin call failed: ${res.status}`);
  faultState[company] = broken;
}

// ---------- Agent Relay observer stream: who is talking to whom ----------
function connectObserver(): void {
  if (!env.RELAY_OBSERVER_TOKEN) return;
  const ws = new WebSocket(`${RELAY_BASE.replace(/^http/, "ws")}/ws?token=${env.RELAY_OBSERVER_TOKEN}`);
  ws.onmessage = (ev) => {
    let raw: any;
    try {
      raw = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    const msg = raw.message ?? raw.data?.message ?? raw.data ?? raw;
    const text: string = msg?.text ?? "";
    // Only real messages; skip read receipts, presence and other bookkeeping events.
    if (!text || /read|presence|status/.test(String(raw.type ?? raw.event ?? ""))) return;
    let envelope: any = null;
    const jsonLine = text.split("\n").find((l) => l.startsWith("{"));
    if (jsonLine) try { envelope = JSON.parse(jsonLine); } catch {}
    const event = {
      at: new Date().toISOString(),
      kind: raw.type ?? raw.event ?? "event",
      from: envelope?.from ?? msg?.agent_name ?? raw.from,
      to: envelope?.to ?? raw.to ?? msg?.channel_name,
      type: envelope?.type ?? envelope?.event,
      text: text.split("\n")[0].slice(0, 160),
      field: envelope?.field,
    };
    if (event.type === "POLICY_BLOCKED" || envelope?.event === "POLICY_BLOCKED") {
      banner = `Policy blocked: ${envelope.company} tried to share a ${envelope.field}`;
      event.type = "POLICY_BLOCKED";
    }
    if (event.type === "ROOT_CAUSE") banner = `Root cause: ${envelope?.text ?? event.text}`;
    relayEvents.push(event);
    if (event.type && event.from && event.from !== "monitor") {
      roomRecord({ at: event.at, company: String(event.from), to: String(event.to ?? ""), type: String(event.type), text: String(envelope?.text ?? event.text) });
    }
    if (relayEvents.length > 200) relayEvents.shift();
    push("relay", event);
  };
  ws.onclose = () => setTimeout(connectObserver, 2000);
  ws.onerror = () => {};
}

// ---------- HTTP ----------
function isLocal(req: IncomingMessage): boolean {
  const remote = req.socket.remoteAddress ?? "";
  const viaTunnel = Boolean(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"]);
  return !viaTunnel && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote);
}

function page(res: ServerResponse, file: string): void {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(readFileSync(join(ROOT, "web", file), "utf8"));
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<any> {
  let raw = "";
  for await (const c of req) raw += c;
  return raw ? JSON.parse(raw) : {};
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const route = `${req.method} ${url.pathname}`;
  try {
    if (route === "GET /") return page(res, "store.html");
    if (route === "GET /screen") return page(res, "screen.html");
    if (route === "GET /control") return isLocal(req) ? page(res, "control.html") : json(res, 403, { error: "local only" });

    if (route === "GET /api/products") return json(res, 200, await (await fetch(`${SHOPCO}/products`)).json());
    if (url.pathname.startsWith("/img/") && req.method === "GET") {
      const file = join(ROOT, "web", "img", url.pathname.slice(5).replace(/[^a-z0-9._-]/gi, ""));
      if (!existsSync(file)) return json(res, 404, { error: "not_found" });
      res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "public, max-age=3600" });
      return res.end(readFileSync(file));
    }
    if (route === "POST /api/checkout") {
      const b = await body(req);
      const shopper = String(b.shopper || randomUUID().slice(0, 8)).replace(/[^a-z0-9-]/gi, "");
      // Card numbers never reach the server: the page sends only brand and last 4 digits.
      const card = b.card ? { brand: String(b.card.brand ?? "card"), last4: String(b.card.last4 ?? "").replace(/\D/g, "").slice(-4) } : undefined;
      const r = await fetch(`${SHOPCO}/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: b.items, product_id: b.product_id, shopper,
          email: b.email || `shopper-${shopper}@example.com`,
          ship_to: b.ship_to, shipping_method: b.shipping_method, card,
        }),
      });
      return json(res, r.status, await r.json());
    }
    if (route === "GET /api/order") {
      const r = await fetch(`${SHOPCO}/order?id=${encodeURIComponent(url.searchParams.get("id") ?? "")}`);
      return json(res, r.status, await r.json());
    }
    if (route === "GET /api/my-orders") {
      const shopper = String(url.searchParams.get("shopper") ?? "").replace(/[^a-z0-9-]/gi, "");
      const r = await fetch(`${SHOPCO}/orders/by-shopper?shopper=${encodeURIComponent(shopper)}`);
      return json(res, r.status, await r.json());
    }
    // Customer-friendly view of what the companies' agents are doing right now.
    if (route === "GET /api/incident-status") {
      const steps = relayEvents
        .filter((e) => e.type && e.from && e.type !== "POLICY_BLOCKED")
        .slice(-8)
        .map((e) => ({ at: e.at, from: e.from, to: e.to, type: e.type, text: e.text }));
      return json(res, 200, { incident, banner, steps });
    }
    if (route === "GET /api/room") return json(res, 200, { enabled: roomEnabled(), error: roomError(), state: await roomState() });
    if (route === "GET /api/room-socket") return json(res, 200, (await roomSocket()) ?? { error: "room disabled" });
    if (route === "GET /api/state") return json(res, 200, { ...snapshot(await orders().catch(() => [])), relay: relayEvents.slice(-30) });
    if (route === "GET /api/store-url") {
      const f = join(ROOT, ".tunnel-url");
      return json(res, 200, { url: existsSync(f) ? readFileSync(f, "utf8").trim() : `http://localhost:${PORT}` });
    }
    if (route === "GET /events") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write("\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    // Control routes: laptop only, never through the public tunnel.
    if (url.pathname.startsWith("/control/")) {
      if (!isLocal(req)) return json(res, 403, { error: "local only" });
      const b = await body(req);
      if (route === "POST /control/fault") {
        await setFault(b.company, Boolean(b.broken));
        banner = b.broken ? banner : banner;
        return json(res, 200, { faults: faultState });
      }
      if (route === "POST /control/traffic") {
        setTraffic(b.mode);
        return json(res, 200, { trafficMode });
      }
      // Demo incident: break a company, then a short burst of shoppers so there are a
      // handful of failed orders (not hundreds) for the agents to recover.
      if (route === "POST /control/demo-start") {
        const company = b.company ?? "payflow";
        await setFault(company, true);
        setTraffic("burst");
        setTimeout(() => { if (trafficMode === "burst") setTraffic("off"); }, Number(b.seconds ?? 20) * 1000);
        return json(res, 200, { faults: faultState, trafficMode, stopsAfterSeconds: Number(b.seconds ?? 20) });
      }
      if (route === "POST /control/incident") {
        if (incident) incident.status = b.status;
        if (b.banner) banner = b.banner;
        return json(res, 200, { incident, banner });
      }
      if (route === "POST /control/reset") {
        for (const c of Object.keys(faultState)) await setFault(c, false);
        incident = null;
        baseline = new Date().toISOString();
        banner = "All systems normal";
        relayEvents.length = 0;
        await roomReset();
        push("reset", {});
        return json(res, 200, { ok: true });
      }
    }
    json(res, 404, { error: "not_found" });
  } catch (e) {
    json(res, 500, { error: String(e) });
  }
}).listen(PORT, () => console.log(`platform on http://localhost:${PORT}  (store /, screen /screen, control /control)`));

setInterval(monitorTick, 3000);
connectObserver();
