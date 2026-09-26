import "server-only";

/**
 * A source's stored OAuth refresh token is no longer valid (rotated, revoked, or
 * expired), so syncing can't recover without the user re-consenting. The sync
 * cron treats this as "disconnected → needs reconnect" rather than a hard
 * failure, so one dead source doesn't fail the whole job on every run.
 */
export class ReauthRequiredError extends Error {
  constructor(
    public readonly source: string,
    detail?: string,
  ) {
    super(`${source} needs reconnecting${detail ? `: ${detail}` : ""}`);
    this.name = "ReauthRequiredError";
  }
}
