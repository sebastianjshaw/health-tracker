# Roadmap — derived insights & features

Data-driven features approved from the data review. Built in tranches; pure
computation libs first (tested), then surfaced in report / stats / character / MCP.

## In progress / approved

- [ ] **Measured (adaptive) TDEE** — fit logged intake + cardio + weight change to
  solve for real maintenance kcal (`lib/tdee.ts`). Surface in report & stats;
  optionally feed the suggested-target logic.
- [ ] **Fat-mass vs lean-mass trends + FFMI** — split weight by body-fat %; FFMI =
  lean ÷ height² as the muscularity counterpart to BMI. Surface in report,
  stats, character.
- [ ] **Plateau / diet-break detection** — flag a flat 7-day average over N weeks
  despite a deficit; suggest recalc (using measured TDEE) or a diet break.
- [ ] **Waist-to-height ratio (WHtR)** — uses logged waist; better central-adiposity
  marker than BMI. Report.
- [ ] **Strength analytics** — estimated 1RM (Epley) per lift, total tonnage, PR
  detection from `lift_sets` (weight × reps). Stats/character.
- [ ] **Bloodwork × weight overlay** — lipids/HbA1c etc. against weight on a timeline.
- [ ] **Streaks / consistency** — logging streak, weigh-in cadence, adherence streak.
- [ ] **Year-over-year & seasonal (by-month) weight** — uses the 14-year history.
- [ ] **Surface lean mass / metabolic age / FFMI on Stats & Character** (not Today).
- [ ] **MCP freshness check** — warn when latest synced activity/HR/sleep is > N days stale.

## Held until Fitbit arrives (~2026-06-22)

These need the richer Fitbit feed (continuous HR, sleep, VO2max) to be meaningful:

- [ ] **Sleep ↔ recovery** — sleep vs next-day resting HR / adherence; resting-HR
  trend as a fitness signal during the cut.
- [ ] **Cardio efficiency / VO2max** — pace-at-HR over time from cardio sessions;
  `vo2-max` data type exists in Google Health but is currently empty (Fitbit may
  populate it).
