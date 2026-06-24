"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

/** Period picker for the character sheet: "Now" (live snapshot) or a calendar
 * year (that year's averages). Navigates via ?year= so the server recomputes. */
export function YearSelect({ year, years }: { year: number | null; years: number[] }) {
  const router = useRouter();
  return (
    <select
      value={year ?? "now"}
      onChange={(e) => {
        const v = e.target.value;
        router.push(v === "now" ? "/character" : `/character?year=${v}`);
      }}
      aria-label="Character sheet period"
      className={cn(
        "rounded-xl border border-border bg-card px-3 py-1.5 text-sm font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <option value="now">Now</option>
      {years.map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
