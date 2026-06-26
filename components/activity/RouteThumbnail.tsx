"use client";

import * as React from "react";
import { decodePolyline } from "@/lib/polyline";

/**
 * Dependency-free route silhouette: decodes the stored polyline and draws it as
 * an SVG path (equirectangular projection, latitude-compressed longitude, north
 * up). No map tiles / API keys — just the shape of where you ran.
 */
export function RouteThumbnail({
  track,
  className,
  strokeWidth = 2,
}: {
  track: string;
  className?: string;
  strokeWidth?: number;
}) {
  const path = React.useMemo(() => {
    const pts = decodePolyline(track);
    if (pts.length < 2) return null;
    const lats = pts.map((p) => p[0]);
    const lons = pts.map((p) => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)); // lon→lat scale
    const w = Math.max((maxLon - minLon) * kx, 1e-6);
    const h = Math.max(maxLat - minLat, 1e-6);
    const pad = 4;
    const scale = (100 - 2 * pad) / Math.max(w, h);
    const ox = pad + (100 - 2 * pad - w * scale) / 2;
    const oy = pad + (100 - 2 * pad - h * scale) / 2;
    const xy = pts.map(([la, lo]) => {
      const x = ox + (lo - minLon) * kx * scale;
      const y = oy + (maxLat - la) * scale; // flip: north up
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { d: `M${xy.join(" L")}`, start: xy[0], end: xy[xy.length - 1] };
  }, [track]);

  if (!path) return null;
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Route map" preserveAspectRatio="xMidYMid meet">
      <path
        d={path.d}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={path.start.split(",")[0]} cy={path.start.split(",")[1]} r={strokeWidth * 1.4} fill="currentColor" />
    </svg>
  );
}
