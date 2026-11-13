// Refuses `npm run db:push` against a remote database unless explicitly allowed.
// Loads env the same way drizzle.config.ts does, so it checks the URL drizzle will use.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const url = process.env.DATABASE_URL ?? "file:local.db";

if (url.startsWith("file:") || process.env.ALLOW_REMOTE_DB_PUSH === "1") {
  process.exit(0);
}

console.error(
  `db:push blocked: DATABASE_URL points at a remote database (${url.split("?")[0]}).\n` +
    "Pushing the schema can alter live data. If that is what you want, re-run with:\n" +
    "  ALLOW_REMOTE_DB_PUSH=1 npm run db:push\n" +
    "To target a local file instead, set DATABASE_URL=file:local.db.",
);
process.exit(1);
