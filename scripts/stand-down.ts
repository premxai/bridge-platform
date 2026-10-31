// Tell every company's agent to stop working on a test incident and go back to waiting.
//   npx tsx scripts/stand-down.ts "<reason>"
import { COMPANIES, readEnv } from "./lib/env.ts";
import { relay } from "./lib/relaycast.ts";

const token = readEnv("platform").RELAY_MONITOR_TOKEN;
const reason = process.argv[2] ?? "That incident was an operator test and is already healed.";
const text = `[STATUS] STAND DOWN: ${reason} Do not open, push, merge or retry anything for it. Operators will close any pull request opened for it. Go back to waiting with relay:wait.\n${JSON.stringify({ bridge: 1, from: "monitor", to: "all", type: "STATUS", text: `STAND DOWN: ${reason}` })}`;
await relay("POST", "/channels/incidents/messages", { token, body: { text } });
for (const c of COMPANIES.filter((c) => readEnv(c).RELAY_AGENT_TOKEN)) {
  await relay("POST", "/dm", { token, body: { to: c, text } });
  console.log(`stand-down sent to ${c}`);
}
