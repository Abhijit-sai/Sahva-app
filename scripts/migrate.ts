import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "../src/db";
const client = await pool.connect();
try {
  await client.query("select pg_advisory_lock($1)", [93746285]);
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
} finally {
  try {
    await client.query("select pg_advisory_unlock($1)", [93746285]);
  } finally {
    client.release();
    await pool.end();
  }
}
