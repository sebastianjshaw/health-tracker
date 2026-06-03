import "server-only";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  computeToken,
  isValidToken,
  sessionSecret,
} from "./session";

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return isValidToken(store.get(SESSION_COOKIE)?.value);
}

export async function createSession(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await computeToken(sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export function checkPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD || "changeme";
  return input === expected;
}
