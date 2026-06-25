/**
 * Google "encoded polyline" algorithm (precision 5) — dependency-free.
 * Encodes an ordered list of [lat, lon] pairs into a compact ASCII string we can
 * store in one text column and later decode for a map/elevation view.
 * Ref: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */

function encodeSigned(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = "";
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  out += String.fromCharCode(v + 63);
  return out;
}

/** Encode [lat, lon] pairs. Coordinates rounded to 5 decimals (~1.1 m). */
export function encodePolyline(points: Array<[number, number]>): string {
  let lastLat = 0;
  let lastLon = 0;
  let out = "";
  for (const [lat, lon] of points) {
    const latE5 = Math.round(lat * 1e5);
    const lonE5 = Math.round(lon * 1e5);
    out += encodeSigned(latE5 - lastLat);
    out += encodeSigned(lonE5 - lastLon);
    lastLat = latE5;
    lastLon = lonE5;
  }
  return out;
}
