// The Incident Room: a Terse Durable Actor that holds the shared incident record.
// The monitor opens it; every message the companies' agents exchange is written to it.
// If Terse is not configured or unreachable, calls are skipped and the demo still runs.
import { readEnv } from "../scripts/lib/env.ts";

const env = readEnv("platform");
if (env.TERSE_ACTOR_URL) process.env.TERSE_ACTOR_URL = env.TERSE_ACTOR_URL;
if (env.TERSE_API_KEY) process.env.TERSE_API_KEY = env.TERSE_API_KEY;
export const ROOM_ID = env.TERSE_ROOM_ID || "bridge-demo";
const enabled = Boolean(env.TERSE_ACTOR_URL);

let room: any = null;
let actorsApi: any = null;
if (enabled) {
  try {
    // @ts-ignore generated JavaScript client
    ({ actors: actorsApi } = await import("../actors/generated/index.js"));
    room = actorsApi.Incident.get(ROOM_ID);
  } catch (e) {
    console.error("Incident Room disabled:", String(e).slice(0, 160));
  }
}

export const roomEnabled = () => Boolean(room);
let lastError = "";
export const roomError = () => lastError;

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  if (!room) return null;
  try {
    const out = await fn();
    lastError = "";
    return out;
  } catch (e) {
    lastError = String(e).slice(0, 200);
    console.error("Incident Room call failed:", lastError);
    return null;
  }
}

export const roomOpen = (incidentId: string, failed: number) => safe(() => room.open(incidentId, failed));
export const roomRecord = (entry: { at: string; company: string; to: string; type: string; text: string }) => safe(() => room.record(entry));
export const roomState = () => safe(() => room.state());
export const roomReset = () => safe(() => room.reset());
export const roomSocket = () => safe(() => actorsApi.Incident.prepareWebsocket({ actorId: ROOM_ID, metadata: { viewer: "screen" } }));
