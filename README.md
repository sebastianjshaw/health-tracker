# Health Tracker

A personal, mobile-first food / activity / body-stats tracker. Single-user, free to host.

## Features

- **Food logging** three ways:
  1. **Recurring defaults** — mark foods as "daily (Mon–Fri)", "weekend", or "every day" per meal; they appear automatically and can be removed per day without deleting the template.
  2. **Manual entry** — add products to your library with per-serving nutrition.
  3. **Barcode scanning** — camera scan → OpenFoodFacts lookup → one-tap add.
- **Today view** — meals (breakfast/lunch/dinner/snacks), per-entry quantity steppers, day totals vs. calorie/protein goals.
- **Activity** — cardio sessions, and a **StrongLifts 5×5** tracker with automatic weight progression (+2.5 kg) and deload after 3 failed sessions.
- **Body & vitals** — weight, body fat, measurements, resting HR, with trend charts.
- **Stats** — weight, calories, and lift-progression charts; editable daily goals.
- **MCP server** — optional [Claude Desktop integration](mcp/README.md) for logging food and vitals via chat.
- Installable as a PWA (add to home screen).

## Tech stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4
- Drizzle ORM + libSQL (local SQLite file in dev → Turso in prod)
- OpenFoodFacts API for barcodes (free, no key)
- Recharts for charts

## Local development

```bash
npm install
cp .env.example .env.local   # then edit values (see below)
npm run db:push              # create tables in local.db
npm run db:seed              # optional: sample foods + recurring defaults
npm run dev                  # http://localhost:3000
```

Login with whatever you set as `APP_PASSWORD` in `.env.local` (the example uses `changeme`).

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | `file:local.db` for dev; `libsql://...` for Turso |
| `DATABASE_AUTH_TOKEN` | prod only | Turso auth token |
| `APP_PASSWORD` | yes | Single-user login password |
| `SESSION_SECRET` | yes | Long random string; signs the session cookie |

## Deploy (free: Vercel + Turso)

Barcode scanning needs HTTPS, so deploy rather than serving over plain HTTP on your LAN.

**1. Create a Turso database**

```bash
brew install tursodatabase/tap/turso
turso auth signup            # or: turso auth login
turso db create health-tracker
turso db show health-tracker --url      # -> DATABASE_URL
turso db tokens create health-tracker   # -> DATABASE_AUTH_TOKEN
```

**2. Push the schema to Turso**

```bash
DATABASE_URL='libsql://...' DATABASE_AUTH_TOKEN='...' npm run db:push
```


**3. Deploy to Vercel**

```bash
npm i -g vercel   # if needed
vercel            # link/create the project
# add env vars (production):
vercel env add DATABASE_URL production
vercel env add DATABASE_AUTH_TOKEN production
vercel env add APP_PASSWORD production
vercel env add SESSION_SECRET production
vercel --prod
```

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Then open the deployment on your phone and "Add to Home Screen".

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run test` | Unit tests (lifts, nutrition, dates, session) |
| `npm run db:push` | Apply schema to the database |
| `npm run db:studio` | Drizzle Studio (browse data) |
| `npm run db:seed` | Insert sample data |
