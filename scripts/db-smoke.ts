// Phase 0 smoke test for Supabase isolation: each company can use its own
// schema and is refused access to another company's schema.
import postgres from "postgres";
import { COMPANIES, readEnv } from "./lib/env.ts";

async function main() {
  let failed = 0;
  for (const c of COMPANIES) {
    const url = readEnv(c).DATABASE_URL;
    if (!url) {
      console.log(`FAIL  ${c}: no DATABASE_URL in ${c}/.env`);
      failed++;
      continue;
    }
    const sql = postgres(url, { ssl: "require", max: 1, onnotice: () => {} });
    try {
      await sql.unsafe(`create table if not exists ${c}.smoke (id int)`);
      await sql.unsafe(`insert into ${c}.smoke values (1)`);
      await sql.unsafe(`drop table ${c}.smoke`);
      console.log(`PASS  ${c}: can write its own schema`);
    } catch (e) {
      console.log(`FAIL  ${c}: cannot use its own schema (${String(e)})`);
      failed++;
    }
    const other = COMPANIES[(COMPANIES.indexOf(c) + 1) % COMPANIES.length];
    try {
      await sql.unsafe(`create table ${other}.intrusion (id int)`);
      console.log(`FAIL  ${c}: was able to write into ${other}'s schema`);
      await sql.unsafe(`drop table ${other}.intrusion`);
      failed++;
    } catch {
      console.log(`PASS  ${c}: refused access to ${other}'s schema`);
    }
    await sql.end();
  }
  process.exit(failed ? 1 : 0);
}

main();
