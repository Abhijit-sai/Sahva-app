import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,
  connectionTimeoutMillis: 8000,
});
pool.on("error", (err) =>
  console.error("PostgreSQL connection error", err.message),
);
export const db = drizzle(pool, { schema });
