import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { validateServerEnv } from "@/lib/env";
import * as schema from "./schema";

validateServerEnv();

const url = process.env.DATABASE_URL ?? "file:local.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;

const isRemote = url.startsWith("libsql://") || url.startsWith("http");

const client = createClient(isRemote ? { url, authToken } : { url });

export const db = drizzle(client, { schema });
export { schema };
