# LEVEL ONE

A local-first personal life operating system: real-life quests, permanent XP and levels, a spendable credit wallet, savings goals and real-life rewards. It runs entirely on your own computer, with no account and no paid services.

> Make progress visible, make responsibilities manageable, and make enjoyment part of the system rather than something postponed until every task is finished.

## Requirements

- **Node.js 22 LTS or 24 LTS** (64-bit) from <https://nodejs.org>. The SQLite driver ships prebuilt binaries for these versions, so no compiler is needed.
- Windows 10/11 (macOS and Linux also work).

## Run it on Windows

### Easiest: double-click

Double-click **`LevelOne.cmd`** in the project folder. The first run installs dependencies and builds the app (this takes a minute). Then the browser opens at <http://127.0.0.1:4317>. Close the window to stop LEVEL ONE.

### From a terminal (PowerShell or Command Prompt)

```powershell
cd path\to\Life-progg
npm install
npm run build
npm start
```

Then open <http://127.0.0.1:4317>. Use `npm run start:open` to open the browser automatically.

### Development mode (hot reload)

```powershell
npm run dev
```

Open <http://127.0.0.1:5173>. The API runs on port 4317, and Vite proxies `/api` to it.

## Your data

| What | Where |
| --- | --- |
| Database | `%APPDATA%\LevelOne\levelone.db` (Windows) or `~/.levelone/levelone.db` |
| Backups | `%APPDATA%\LevelOne\backups\` |

The data lives **outside** the project folder, so re-cloning or updating the code never touches it. To use another location, set `LEVELONE_DATA_DIR` first, e.g. `$env:LEVELONE_DATA_DIR="D:\LevelOneData"; npm start`.

- **Backups:** Settings → *Back up now*. LEVEL ONE also backs up automatically before any database upgrade and before any restore.
- **Restore:** Settings → *Restore* on any verified backup. Your current data is snapshotted first, so a restore can itself be undone.
- **Export:** Settings → *Export JSON* gives a full, readable export (API keys are never included).

## Checks

```powershell
npm run typecheck   # strict TypeScript for server, client and tests
npm test            # Vitest: domain, services, API and React components
npm run check       # typecheck + tests + production build

# End-to-end (Playwright), against a throwaway database:
npx playwright install chromium   # first time only
npm run build
npm run test:e2e
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `LEVELONE_PORT` | `4317` | Server port |
| `LEVELONE_HOST` | `127.0.0.1` | Bind address. Loopback only by default, so the app is not reachable from your network |
| `LEVELONE_DATA_DIR` | see above | Database and backup location |
| `LEVELONE_LOG` | off | Set to `1` for request logging |

## Architecture

```
src/
  shared/types.ts          Types + level/rank maths shared by server and client
  server/
    index.ts               Entry point (config, DB, HTTP server)
    app.ts                 Fastify routes, validation, error handling, security hooks
    validation.ts          Zod schemas for every request body
    db/schema.ts           Drizzle schema (source of truth for migrations)
    db/store.ts            SQLite connection, migrations, pre-migration backups, transactions
    domain/dates.ts        Timezone-aware calendar maths (ISO weeks, rest days)
    services/              Business logic: quests, progression, savings, onboarding, backup...
  client/
    App.tsx                Shell, routing, page transitions, reduced-motion handling
    components/ui/         shadcn-style primitives (Radix + Tailwind)
    components/layout/     Sidebar, top bar, Ctrl+K palette, toasts, level-up overlay
    components/quests/     Quest editor and quest row
    pages/                 Dashboard, Quest Board, Character, Wealth, Rewards, Timeline, Settings, Onboarding
drizzle/                   Generated SQL migrations (append-only)
tests/                     Vitest suites
e2e/                       Playwright journey
```

**Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, shadcn-style Radix components, Motion, Recharts, Lucide · Fastify 5, Drizzle ORM, SQLite (better-sqlite3), Zod · Vitest, React Testing Library, Playwright.

### Integrity rules

- XP and credits live in separate append-only ledgers. Balances are always sums of the ledger, never stored totals.
- Every payout carries a unique idempotency key, and a partial unique index allows only one live completion per quest instance. Double clicks and retries cannot pay twice.
- Completion, payout and timeline writes happen in one SQLite transaction. Any failure rolls everything back.
- The credit wallet can never go negative. An undo whose credits were already spent is refused.
- Editing a quest affects future completions only. Past payouts are never rewritten.
- Money is stored as integer cents. Savings progress counts confirmed transactions only, and projections are labelled as estimates.
- Mutating API calls require an `X-Level-One` header, which blocks cross-site requests from other browser tabs.

### Adding a database change

1. Edit `src/server/db/schema.ts`.
2. Run `npm run db:generate -- --name short_description` to create a new SQL migration in `drizzle/`.
3. Commit the migration. Existing databases upgrade automatically on next start, with a backup taken first.

Never edit or delete a migration that has shipped.

## Status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Shell, database, settings, onboarding, dashboard | **Done** |
| 2 | Quests, XP engine, levels, ranks, credits, character | **Done** |
| 3 | Wealth Center (budgets, debts, cash flow), Rewards Vault redemption and budget safeguards | Savings goals done. Rest planned |
| 4 | Achievements, skill trees, seasons, full timeline | Planned (seasons and achievement tables exist, so the dashboard reads them) |
| 5 | AI strategist (Claude) | API key storage done. Strategist planned |
| 6 | JSON import, accessibility pass, Tauri packaging | Backup, restore and export done. Rest planned |

Future idea: connect Google Calendar so planned commitments become suggested quests. LEVEL ONE works fully on its own first.
