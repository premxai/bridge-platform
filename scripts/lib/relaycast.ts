// Minimal client for the hosted Agent Relay engine (Relaycast REST API).
export const RELAY_BASE = process.env.RELAY_BASE_URL ?? "https://cast.agentrelay.com/v1";

export class RelayError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(`${status} ${code}: ${message}`);
  }
}

export async function relay<T = any>(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
  const res = await fetch(`${RELAY_BASE}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok || json.ok === false) {
    throw new RelayError(res.status, json?.error?.code ?? "unknown", json?.error?.message ?? text);
  }
  return (json.data ?? json) as T;
}
