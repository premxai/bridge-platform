// One-time Supabase setup: one schema and one login role per company, plus a
// read-only platform role. Each company's DATABASE_URL goes only into that
// company's .env. Needs SUPABASE_DB_URL_ADMIN in platform/.env (the session
// pooler connection string for the postgres user, port 5432).
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { COMPANIES, mask, readEnv, setEnv } from "./lib/env.ts";

const adminUrl = readEnv("platform").SUPABASE_DB_URL_ADMIN;
if (!adminUrl) {
  console.error("Set SUPABASE_DB_URL_ADMIN in platform/.env first (Supabase > Connect > Session pooler).");
  process.exit(1);
}

// Supabase's pooler expects the user as <role>.<project_ref>.
function urlFor(role: string, password: string): string {
  const u = new URL(adminUrl);
  const ref = decodeURIComponent(u.username).split(".")[1];
  u.username = ref ? `${role}.${ref}` : role;
  u.password = password;
  if (!u.searchParams.has("sslmode")) u.searchParams.set("sslmode", "require");
  return u.toString();
}

const sql = postgres(adminUrl, { ssl: "require", max: 1, onnotice: () => {} });

async function ensureRole(role: string): Promise<string> {
  const password = randomBytes(18).toString("base64url");
  const exists = await sql`select 1 from pg_roles where rolname = ${role}`;
  if (exists.length) await sql.unsafe(`alter role ${role} with login password '${password}'`);
  else await sql.unsafe(`create role ${role} with login password '${password}' noinherit`);
  return password;
}

async function main() {
  for (const schema of [...COMPANIES, "platform"]) {
    await sql.unsafe(`create schema if not exists ${schema}`);
  }

  for (const c of COMPANIES) {
    const role = `${c}_svc`;
    const password = await ensureRole(role);
    await sql.unsafe(`
      revoke all on schema ${c} from public;
      grant usage, create on schema ${c} to ${role};
      grant all on all tables in schema ${c} to ${role};
      grant all on all sequences in schema ${c} to ${role};
      alter default privileges in schema ${c} grant all on tables to ${role};
      alter default privileges in schema ${c} grant all on sequences to ${role};
    `);
    const url = urlFor(role, password);
    setEnv(c, "DATABASE_URL", url);
    console.log(`${c}: schema + role ready, DATABASE_URL -> ${c}/.env (${mask(url)})`);
  }

  // Read-only platform role: the screen and monitor read a few company tables.
  // Table-level grants are added by each company's schema.sql in Phase 1.
  const roPassword = await ensureRole("platform_ro");
  await sql.unsafe(`
    grant usage on schema platform, shopco, notifyco, bank to platform_ro;
    grant all on schema platform to platform_ro;
  `);
  setEnv("platform", "PLATFORM_RO_DATABASE_URL", urlFor("platform_ro", roPassword));
  console.log("platform_ro: role ready, URL -> platform/.env");

  await sql.end();
}

main().catch(async (e) => {
  console.error(String(e));
  await sql.end();
  process.exit(1);
});
