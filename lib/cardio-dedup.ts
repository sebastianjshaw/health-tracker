/**
 * Two apps (Google Fit + Withings) both write the SAME exercise session into
 * Health Connect, so the feed double-counts: identical or time-overlapping
 * sessions that are really one activity. You can only do one cardio at a time,
 * so any sessions whose time intervals overlap are treated as the same activity
 * — we keep the richest single record and drop the rest.
 */

export type DedupSession = {
  externalId: string;
  startMs: number;
  endMs: number;
  /** Has a measured distance — the more complete record (usually the Fit copy). */
  hasDistance: boolean;
  durationMin: number;
};

/** Is `a` the better record to keep than `b`? Prefer distance, then the longer
 * session, then a stable id so the choice is deterministic across runs. */
function better(a: DedupSession, b: DedupSession): boolean {
  if (a.hasDistance !== b.hasDistance) return a.hasDistance;
  if (a.durationMin !== b.durationMin) return a.durationMin > b.durationMin;
  return a.externalId > b.externalId;
}

/**
 * Partition overlapping sessions into the ones to keep (one per overlap cluster)
 * and the externalIds of the redundant duplicates to drop. Input order doesn't
 * matter; clustering is by time overlap.
 */
export function dedupeSessions<T extends DedupSession>(
  sessions: T[],
): { winners: T[]; loserIds: string[] } {
  const sorted = [...sessions].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const winners: T[] = [];
  const loserIds: string[] = [];

  let cluster: T[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    if (cluster.length === 0) return;
    let best = cluster[0];
    for (const s of cluster) if (s !== best && better(s, best)) best = s;
    winners.push(best);
    for (const s of cluster) if (s !== best) loserIds.push(s.externalId);
    cluster = [];
  };

  for (const s of sorted) {
    if (cluster.length > 0 && s.startMs < clusterEnd) {
      cluster.push(s);
      clusterEnd = Math.max(clusterEnd, s.endMs);
    } else {
      flush();
      cluster = [s];
      clusterEnd = s.endMs;
    }
  }
  flush();

  return { winners, loserIds };
}
