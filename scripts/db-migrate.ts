// Applies database/migrations/*.sql in order to the Postgres database in SUPABASE_DB_URL.
// Each file runs in its own transaction and is recorded in public._migrations, so the
// script is safe to re-run. Usage: npm run db:migrate
//
// Alternative without a connection string: paste each file, in order, into the
// Supabase SQL Editor (see docs/08-deployment.md).

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config();

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set. Add the Postgres connection string from Supabase → Project Settings → Database to .env.local.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, ssl: "require", onnotice: () => {} });
const dir = path.resolve("database/migrations");

try {
  await sql`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table public._migrations enable row level security`; // not exposed through the API
  const applied = new Set((await sql<{ name: string }[]>`select name from public._migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }
    const body = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public._migrations (name) values (${file})`;
    });
    console.log(`  apply ${file}`);
  }
  console.log("Migrations complete.");
} catch (err) {
  console.error("Migration failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
