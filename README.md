# Bridge

**When something breaks between companies, each company's own AI agent fixes it together, in minutes instead of days.**

Every online purchase passes through several companies: the store, the payment processor and the fraud check. When something breaks *between* them, no single team can see the whole picture. Today that means a bridge call, three on-call engineers and days of emails.

Bridge gives each company its own on-call AI agent. The agents:
- work only inside their own company's code, logs and servers;
- talk to each other only through **Agent Relay**;
- record everything in one shared incident file, a **Terse Durable Actor**;
- ship the fix as a real pull request that a human approves;
- deploy to the company's own **Freestyle** VM, then recover every failed order.

Built at **Haunted Hacks: Real-Time AI Edition** (YC, San Francisco, Oct 31 2026).

## The demo

Three fictional companies, each with its own GitHub repo, its own AI agent and its own server:

| Company | What it does | AI agent | Repo |
|---|---|---|---|
| **ShopCo** | Online store | Codex (OpenAI) | [bridge-shopco](https://github.com/premxai/bridge-shopco) |
| **PayFlow** | Payment processor | Claude Code | [bridge-payflow](https://github.com/premxai/bridge-payflow) |
| **ShieldCo** | Fraud check | OpenCode (DeepSeek) | [bridge-shieldco](https://github.com/premxai/bridge-shieldco) |

**The bug.** PayFlow ships "contract v2", which sends amounts in **cents**. Nobody told ShieldCo, so ShieldCo still reads them as dollars. A $68 hoodie arrives as $6,800, trips the $500 fraud limit, and checkouts start failing. Each company's code is correct on its own; the bug only exists between them.

**What happens next. No human steps in until the merge.**

1. **The alarm.** The monitor sees 3 or more failed checkouts in 30 seconds and raises one alarm through an Agent Relay webhook. The incident opens in the Terse Incident Room.
2. **ShopCo leads.** It checks its own logs, proves its requests were valid, clears itself, and asks PayFlow for evidence.
3. **PayFlow checks its side.** It confirms it sent v2 cents, clears itself, and asks ShieldCo.
4. **ShieldCo finds the root cause.** Its logs show v2 amounts read as dollars. It proposes a fix, PayFlow agrees, and ShieldCo opens a pull request with tests.
5. **A human merges the PR.** The agents cannot merge.
6. **ShieldCo deploys** the merged fix to its Freestyle VM.
7. **ShopCo retries** every failed order and posts the recovered total.

Real runs: the agents found the root cause in under 2 minutes. One run recovered 295 orders worth $17,217.70.

## How the sponsor tools are used

### Agent Relay: the only line between companies
- Each agent has its own Relay identity. They talk through **direct messages** and the `#incidents` channel.
- The monitor raises the alarm by posting to a Relay **inbound webhook**.
- The big screen and the 4th terminal window read Relay's **observer WebSocket**, so the audience sees every message live.
- A code-enforced **privacy check** runs before anything is sent. It blocks emails, phone numbers, card numbers, addresses and keys. A blocked attempt shows on screen as "Policy blocked".
- `relay:wait` reads `#incidents` and each known DM conversation directly, so the agents keep working while Relay's inbox service is having trouble.

### Terse Durable Actors: the shared incident file
- One `Incident` actor that no company owns (`actors/src/actor.ts`), deployed to Terse cloud.
- **One call at a time:** when three agents write at once, the writes are ordered and never overwrite each other ("N writes, 0 conflicts").
- **Merges repeat alarms:** the monitor keeps firing while orders fail, and the actor folds every repeat into the one open incident.
- Tracks status (open → root cause → fixing → recovering → resolved) and marks each company as investigating, cleared or root cause.
- **Persisted:** if the platform server restarts mid-incident, the incident is restored from the actor rather than opened again.
- The big screen subscribes to the actor's **WebSocket** for live updates.

### Freestyle: each company's own server
- ShopCo, PayFlow and ShieldCo each run on their **own Freestyle VM**, with public HTTPS at `bridge-<company>-hh31.style.dev`.
- Each agent's `npm run deploy` uploads its company's code to its own VM and restarts it.
- Each agent's `logs:recent` reads that company's request logs from its VM.

### OpenAI and the other agents
- ShopCo's agent is **OpenAI Codex**. PayFlow runs Claude Code, and ShieldCo runs OpenCode with DeepSeek. That makes three different AI tools from three vendors, coordinating through one protocol.

## What's in this repo (`bridge-platform`)

This repo belongs to no company. No company agent ever works here.

| Path | What it is |
|---|---|
| `web/store.html` | The ShopCo storefront: product pages, bag, full checkout with address, shipping and test card, order pages. Card numbers never leave the browser; only the brand and last 4 digits are sent. |
| `web/screen.html` | The big screen: the company chain, a live headline, business impact, the Incident Room (Terse) and the agent conversation (Agent Relay). |
| `web/control.html` | Fault panel, local only: break or heal PayFlow, simulated shoppers, "Start demo incident", reset. |
| `src/server.ts` | Serves the store and screen, proxies checkout to ShopCo's VM, runs the monitor and shopper simulator, streams the Relay observer feed. |
| `src/incident-room.ts` | Client for the Terse Incident actor. |
| `actors/` | The Terse project (`Incident` actor). |
| `scripts/` | Relay and Freestyle setup, `watch-room.ts` (the live Relay window), `reset-demo.sh`, `terse.sh` (the Terse CLI through Docker on Windows). |

## Run it

Requirements: Node 22+, the `gh` CLI, and a `.env` in each repo with Agent Relay, Freestyle and Terse keys (not committed).

```bash
# platform
npm install
npx tsx src/server.ts                # http://localhost:3000  (store /, screen /screen, control /control)
npx tsx scripts/watch-room.ts        # live Agent Relay window

# in each company repo, start its agent and say:
#   "Start your shift. Follow AGENTS.md."
```

Then press **Start demo incident** on `/control`. To run it again: stop the agents, run `bash scripts/reset-demo.sh`, and start the agents fresh.

## Safety rules the agents follow
- Each agent works only in its own company's folder and never reads `.env`.
- Customer data never leaves a company. The send tool blocks it in code, not just by instruction.
- Agents open pull requests but **cannot merge them**. Every agent's instructions forbid merging, PayFlow's and ShieldCo's tool settings block `gh pr merge`, and a human approves every fix.

## Disclosure

- **Before the event** (the night of Oct 30, before 11:00 on Oct 31): empty repo skeletons for the companies and the platform, Agent Relay and Supabase setup scripts, and the Docker wrapper for the Terse CLI. See `git log --until "2026-10-31 11:00"` in each repo.
- **At the event:** everything else. That covers:
  - the company services and payment contracts;
  - the agent instructions and messaging tools;
  - the privacy check;
  - the Freestyle deployment;
  - the Terse Incident actor;
  - the store, big screen, monitor and fault panel;
  - the recovery flow.

  See `git log --since "2026-10-31 11:00"`.
- Supabase setup scripts exist, but Supabase is **not used** in the demo.
