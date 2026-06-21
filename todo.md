# Roadmap — derived insights & features

Data-driven features approved from the data review. Built in tranches; pure
computation libs first (tested), then surfaced in report / stats / character / MCP.

## Done

- [x] **Measured (adaptive) TDEE** — `lib/tdee.ts`; shown in report summary & stats Insights.
- [x] **Fat-mass vs lean-mass + FFMI** — `lib/metabolic-age.ts`; report vitals, stats, character.
- [x] **Plateau / diet-break detection** — `lib/plateau.ts`; warning note in the report.
- [x] **Waist-to-height ratio (WHtR)** — `lib/health.ts`; report vitals.
- [x] **Strength analytics** — `lib/strength.ts` (Epley e1RM, tonnage, PRs); character + stats PR cards.
- [x] **Streaks / consistency** — `lib/streaks.ts` (current/longest). _Built; not yet surfaced in UI._
- [x] **Year-over-year & seasonal weight** — `lib/seasonal.ts`; "Weight by year" in stats Insights.
- [x] **Lean mass / metabolic age / FFMI on Stats & Character.**
- [x] **MCP freshness check** — `get_sync_freshness` tool.

## Remaining

- [ ] **Bloodwork × weight overlay** — lipids/HbA1c etc. against weight on a timeline
  (needs a dual-axis chart component — the one chart-heavy item left).
- [ ] **Surface streaks** — `lib/streaks.ts` is built & tested but not yet shown (e.g. a
  logging-streak tile on stats). Monthly (by-month) seasonal view also still text-only.

## Held until Fitbit arrives (~2026-06-22)

These need the richer Fitbit feed (continuous HR, sleep, VO2max) to be meaningful:

- [ ] **Sleep ↔ recovery** — sleep vs next-day resting HR / adherence; resting-HR
  trend as a fitness signal during the cut.
- [ ] **Cardio efficiency / VO2max** — pace-at-HR over time from cardio sessions;
  `vo2-max` data type exists in Google Health but is currently empty (Fitbit may
  populate it).
