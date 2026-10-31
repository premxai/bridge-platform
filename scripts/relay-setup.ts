// One-time Agent Relay setup: workspace, one agent per company (+ monitor),
// channels, the alert webhook and an observer token for the screen.
// Secrets go only into the owning repo's .env and are never printed in full.
import { COMPANIES, mask, readEnv, setEnv } from "./lib/env.ts";
import { relay, RelayError } from "./lib/relaycast.ts";

const WORKSPACE_NAME = "bridge-hauntedhacks";
const CHANNELS = [
  { name: "incidents", topic: "Alerts from the monitor; ShopCo leads" },
  { name: "bridge-events", topic: "Policy blocks and status events for the screen" },
];

async function main() {
  let key = readEnv("platform").RELAY_WORKSPACE_KEY;
  if (!key) {
    // The hosted engine does not support anonymous idempotent creates, so send none.
    const ws = await relay("POST", "/workspaces", { body: { name: WORKSPACE_NAME } });
    key = ws.key ?? ws.api_key ?? ws.workspace?.key;
    if (!key) throw new Error(`No workspace key in response: ${Object.keys(ws).join(", ")}`);
    setEnv("platform", "RELAY_WORKSPACE_KEY", key);
    console.log(`workspace ${WORKSPACE_NAME} created, key ${mask(key)}`);
  } else {
    console.log(`workspace key already in platform/.env (${mask(key)})`);
  }

  const agents: { name: string; repo: string; envKey: string }[] = [
    ...COMPANIES.map((c) => ({ name: c, repo: c, envKey: "RELAY_AGENT_TOKEN" })),
    { name: "monitor", repo: "platform", envKey: "RELAY_MONITOR_TOKEN" },
  ];
  for (const a of agents) {
    if (readEnv(a.repo)[a.envKey]) {
      console.log(`agent ${a.name}: token already set`);
      continue;
    }
    try {
      const agent = await relay("POST", "/agents", {
        token: key,
        body: { name: a.name, type: a.name === "monitor" ? "system" : "agent" },
      });
      if (!agent.token) throw new Error(`No token returned for ${a.name}`);
      setEnv(a.repo, a.envKey, agent.token);
      console.log(`agent ${a.name}: registered, token ${mask(agent.token)} -> ${a.repo}/.env`);
    } catch (e) {
      if (e instanceof RelayError && e.status === 409) {
        console.log(`agent ${a.name}: exists but token missing locally; rotate with POST /agents/${a.name}/rotate-token`);
      } else throw e;
    }
  }

  for (const ch of CHANNELS) {
    try {
      await relay("POST", "/channels", { token: key, body: ch });
      console.log(`channel #${ch.name}: created`);
    } catch (e) {
      if (e instanceof RelayError && e.status === 409) console.log(`channel #${ch.name}: exists`);
      else throw e;
    }
  }

  // Every agent joins both channels so it can read alerts and events.
  const tokens = [
    ...COMPANIES.map((c) => readEnv(c).RELAY_AGENT_TOKEN),
    readEnv("platform").RELAY_MONITOR_TOKEN,
  ];
  for (const t of tokens) {
    if (!t) continue;
    for (const ch of CHANNELS) await relay("POST", `/channels/${ch.name}/join`, { token: t });
  }
  console.log("all agents joined #incidents and #bridge-events");

  if (!readEnv("platform").RELAY_ALERT_WEBHOOK_URL) {
    const hook = await relay("POST", "/webhooks", { token: key, body: { name: "monitor-alerts", channel: "incidents" } });
    setEnv("platform", "RELAY_ALERT_WEBHOOK_URL", hook.url);
    setEnv("platform", "RELAY_ALERT_WEBHOOK_TOKEN", hook.token);
    console.log(`webhook for #incidents: created, token ${mask(hook.token)}`);
  } else console.log("webhook already set");

  if (!readEnv("platform").RELAY_OBSERVER_TOKEN) {
    const ot = await relay("POST", "/observer-tokens", {
      token: key,
      body: {
        name: "bridge-screen",
        scopes: ["stream:read", "messages:read", "channels:read", "dms:read", "agents:read"],
        filters: { include_dms: true },
      },
    });
    const raw = ot.token ?? ot.raw_token ?? ot.secret;
    if (!raw) throw new Error(`No observer token in response: ${Object.keys(ot).join(", ")}`);
    setEnv("platform", "RELAY_OBSERVER_TOKEN", raw);
    console.log(`observer token: created ${mask(raw)}`);
  } else console.log("observer token already set");
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
