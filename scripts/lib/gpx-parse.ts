/**
 * Minimal, dependency-free GPX reader for Strava track exports. We only need the
 * ordered trackpoint coordinates (for the stored polyline); elevation gain comes
 * from the activities.csv summary, so this stays a pure string → points helper.
 */

export type TrackPoint = { lat: number; lon: number };

/** Pull `<trkpt lat=… lon=…>` coordinates, in document order. */
export function parseTrackPoints(gpxXml: string): TrackPoint[] {
  const pts: TrackPoint[] = [];
  for (const m of gpxXml.matchAll(/<trkpt\s+lat="([-\d.]+)"\s+lon="([-\d.]+)"/g)) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) pts.push({ lat, lon });
  }
  return pts;
}

/**
 * Stride a point list down to at most `max` points (keeps first & last). Long
 * activities can be many thousands of points; ~1500 keeps the stored polyline
 * small while preserving the route shape.
 */
export function downsample<T>(points: T[], max = 1500): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}
