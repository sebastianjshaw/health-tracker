import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Load .env.local first (the remote/prod creds the app + scripts use, gitignored)
// so `npm run db:push`/`db:studio` target the SAME database — not a stray local
// file. dotenv doesn't override already-set vars, so .env.local wins; .env is a
// fallback for anything it doesn't define.
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
