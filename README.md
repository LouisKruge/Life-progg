# LEVEL ONE

A local-first personal life operating system: real-life quests, permanent XP and levels, a credit wallet for real-life rewards, a full personal finance centre, achievements, skill trees, ninety-day seasons, a timeline of your progress, and an optional Claude-powered strategist. It runs entirely on your own computer. There's no account, and no paid service is required.

> Make progress visible, make responsibilities manageable, and make enjoyment part of the system rather than something postponed until every task is finished.

## Requirements

- **Node.js 22 LTS or 24 LTS** (64-bit) from <https://nodejs.org>. The SQLite driver ships prebuilt binaries for these versions, so no compiler is needed.
- Windows 10/11 (macOS and Linux also work).

## Run it on Windows

### Easiest: double-click

Double-click **`LevelOne.cmd`** in the project folder. The first run installs dependencies and builds the app (about a minute). Then your browser opens at <http://127.0.0.1:4317>. Close the window to stop LEVEL ONE.

> After pulling a new version, just double-click `LevelOne.cmd` again: it reinstalls and rebuilds only when something changed. Your data is upgraded automatically, with a backup taken first.

### From a terminal (PowerShell or Command Prompt)

```powershell
cd path\to\Life-progg
npm install
npm run build
npm start
```

Open <http://127.0.0.1:4317>, or use `npm run start:open` to open the browser automatically.

### Development mode (hot reload)

```powershell
npm run dev
```

Open <http://127.0.0.1:5173>. The API runs on port 4317, and Vite proxies `/api` to it.

## Checks

```powershell
npm run typecheck   # strict TypeScript: server, client, tests
npm test            # Vitest: domain maths, services, API, React components
npm run check       # typecheck + tests + production build

# End-to-end + accessibility (Playwright + axe-core) against a throwaway database:
npx playwright install chromium   # first time only
npm run test:e2e
```

## What's in the app

| Module | What it does |
| --- | --- |
| **Dashboard** | Level, rank, animated XP, credits, today's missions, completion %, savings goal, current season, weekly activity, six life categories, recent unlocks, next reward, upcoming milestones, daily focus (planner or AI), quick actions |
| **Quest Board** | Daily, weekly, custom-weekday and one-time quests; milestone, challenge and season quests. Complete, undo within a configurable window, skip without penalty, reschedule, archive. Notes or explicit confirmation for milestones. Rest days and a soft daily workload limit. Import calendar events (.ics) as suggested quests |
| **Character** | Level and rank, lifetime stats, per-category mastery, and the full XP and credit ledger |
| **Skill Trees** | Six trees (Wealth, Physique, Mind, Empire, Life, Discipline) with dependencies. Unlocks come only from real data. Zoomable, pannable graph plus an accessible list view |
| **Wealth Center** | Accounts, confirmed vs scheduled transactions, recurring debit orders and salary (you confirm each one), budgets with carry-forward, debts with payoff forecasts, emergency fund, savings goals, projections and what-if scenarios |
| **Rewards Vault** | Real-life rewards with credit price, estimated rand cost, quantity, one-time or repeatable, wishlist, reordering. Redeem, cancel for a refund, confirm what it actually cost |
| **Achievements** | 22 built-in achievements with explicit conditions, manual real-world ones with evidence, and your own custom achievements. Permanent once unlocked |
| **Life Seasons** | Ninety-day seasons with up to three primary objectives, changeable goals, weekly reviews, weekly XP chart, a frozen end-of-season summary and a celebration |
| **AI Strategist** | Optional. Planning, reviews, goal breakdowns and progress explanations with Claude, plus an offline planner (daily plan, weekly review, suggested quests, reflection prompts) |
| **Timeline** | Everything meaningful in order. Filter by type, category and date; group weekly, monthly or yearly; add notes, life events and progress snapshots |
| **Settings** | Profile, timezone (Africa/Johannesburg), locale (en-ZA), currency (ZAR), rest days, workload limit, undo window, reward balancing, rank titles, monthly plan, AI key, backups, restore, JSON export and import, demo data |

## Your data

| What | Where |
| --- | --- |
| Database | `%APPDATA%\LevelOne\levelone.db` (Windows) or `~/.levelone/levelone.db` |
| Backups | `%APPDATA%\LevelOne\backups\` |

The data lives **outside** the project folder, so re-cloning or updating the code never touches it. To use another location, set `LEVELONE_DATA_DIR`, e.g. `$env:LEVELONE_DATA_DIR="D:\LevelOneData"; npm start`.

- **Automatic backups:** taken before every database upgrade, every restore and every import.
- **Manual backup / restore:** Settings → *Data & backups*. Every backup is integrity-checked; restoring first snapshots your current data, so a restore can itself be undone.
- **JSON export / import:** a full, readable export of every record (API keys are never included). Importing builds and verifies a new database before anything is replaced, and keeps your API key.

## Financial and reward safeguards

- Credits have no monetary value. They can't be bought or exchanged and are only earned from quests.
- A paid reward needs enough credits **and** enough of your monthly reward allowance, which is separate from savings.
- Redeeming only *reserves* the allowance. You confirm actual spending separately, and spending can never be recorded against a protected savings or emergency account.
- LEVEL ONE never moves money. Scheduled transactions stay "scheduled" until you confirm they cleared. Projections are always labelled as estimates.
- There are no loot boxes, gambling mechanics or purchasable credits. Rest, food and relationships are never framed as things you must earn.

## AI strategist (optional)

1. Get a Claude API key from <https://platform.claude.com>.
2. In LEVEL ONE, open Settings → *AI strategist*, paste the key and turn it on. The key is stored only in your local database and is never sent to the browser or included in exports.
3. Open **AI Strategist**. In the privacy panel, choose which data categories it may read: quests, progress, finances, rewards, seasons, journal. By default finances, rewards and journal are off.

It uses `claude-opus-5-5`, with server-side refusal fallbacks enabled (`fallbacks: "default"`). It can only *propose* changes (new quests, completions you mention, notes, season objectives); nothing happens until you press **Approve**, and approvals run through the same validated code as the rest of the app. Model output is never executed as code or SQL. Without a key, the planner mode works fully offline.

## Calendar suggestions

Quest Board → **From calendar** reads an `.ics` export (Google Calendar: Settings → Import & export → Export; Outlook and Apple Calendar can export too). Events in the next 30 days are shown; only the ones you tick become one-time quests. The file is read on this computer; no account connection is needed. Recurring events use their first occurrence.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `LEVELONE_PORT` | `4317` | Server port |
| `LEVELONE_HOST` | `127.0.0.1` | Bind address. Loopback by default; requests must address a local host |
| `LEVELONE_DATA_DIR` | see above | Database and backup location |
| `LEVELONE_LOG` | off | `1` enables request logging |

## Architecture

```
src/
  shared/types.ts           Types + level/rank maths shared by server and client
  server/
    index.ts                Entry point (config, DB, bootstrap, HTTP server)
    app.ts                  Fastify app: security hooks, error handling, core routes
    routes/                 rewards, wealth, progress (achievements/skills/seasons/timeline), ai
    validation.ts           Zod schemas for every request body
    bootstrap.ts            Seeds built-in definitions, registers unlock hooks
    db/schema.ts            Drizzle schema (source of truth for migrations)
    db/store.ts             SQLite connection, migrations, pre-migration backups, transactions
    domain/                 Pure logic: dates/timezones, finance maths, .ics parsing
    services/               Business logic, one module per area
  client/
    App.tsx                 Shell, lazy-loaded routes, page transitions, reduced motion
    components/ui/          shadcn-style primitives (Radix + Tailwind)
    components/layout/      Sidebar, top bar, Ctrl+K palette, toasts, level-up and unlock celebrations
    pages/                  One file per module
drizzle/                    SQL migrations (append-only)
tests/                      Vitest (unit, services, API, React Testing Library)
e2e/                        Playwright journeys + axe-core accessibility scan
```

**Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, shadcn-style Radix components, Motion, Recharts, Lucide, TanStack Query · Fastify 5, Drizzle ORM, SQLite (better-sqlite3), Zod · Anthropic TypeScript SDK · Vitest, React Testing Library, Playwright, axe-core.

### Integrity rules

- XP and credits live in separate append-only ledgers; balances are always sums. Every entry has a unique idempotency key.
- A partial unique index allows one live completion per quest instance, so double clicks and retries can't pay twice. Recurring quests get one instance per day or ISO week.
- Each mutation runs in one SQLite transaction. Achievement and skill unlocks are evaluated inside the same transaction, so a failure rolls everything back.
- Neither the credit wallet nor protected accounts can go negative. Confirmed financial records are corrected with reversing entries, never deleted.
- Editing a quest never rewrites past payouts. Seasons never reset lifetime data. Unlocks are permanent.
- Security: loopback binding, a Host-header check (DNS rebinding) and a required `X-Level-One` header on mutations (cross-site requests).

### Adding a database change

1. Edit `src/server/db/schema.ts`.
2. Run `npm run db:generate -- --name short_description`.
3. Commit the new file in `drizzle/`. Existing databases upgrade on next start, with a backup first.

Never edit or delete a migration that has shipped.

## Desktop packaging (optional, future)

LEVEL ONE is a standard local web app, so it can be wrapped later without code changes. The likely path is [Tauri](https://tauri.app) with the Node server as a sidecar, or a single executable via Node's SEA. That isn't needed to use it today: `LevelOne.cmd` plus a desktop shortcut gives the same one-click start on Windows.

## Known limitations

- No bank integration: every transaction is entered (or confirmed) by you, by design.
- Calendar import is a manual `.ics` upload; there's no live Google Calendar sync.
- Recurring calendar events (RRULE) import only their first occurrence.
- AI features need your own Claude API key and an internet connection; everything else works offline.
- Single user only.
