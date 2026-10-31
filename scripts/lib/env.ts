import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join } from "node:path";

// Root of the HauntedHacks folder (platform/scripts/lib -> ../../..).
export const ROOT = join(import.meta.dirname, "..", "..", "..");

export const COMPANIES = ["shopco", "payflow", "shieldco", "bank", "notifyco"] as const;
export type Company = (typeof COMPANIES)[number];

export function envPath(repo: string): string {
  return join(ROOT, repo, ".env");
}

export function readEnv(repo: string): Record<string, string> {
  const path = envPath(repo);
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// Set KEY=value in <repo>/.env, creating it from .env.example on first use.
export function setEnv(repo: string, key: string, value: string): void {
  const path = envPath(repo);
  const example = join(ROOT, repo, ".env.example");
  if (!existsSync(path) && existsSync(example)) copyFileSync(example, path);
  const lines = existsSync(path) ? readFileSync(path, "utf8").split(/\r?\n/) : [];
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (idx >= 0) lines[idx] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  writeFileSync(path, lines.join("\n").replace(/\n*$/, "\n"));
}

export function mask(secret: string | undefined): string {
  if (!secret) return "(missing)";
  return `${secret.slice(0, 8)}…(${secret.length} chars)`;
}
