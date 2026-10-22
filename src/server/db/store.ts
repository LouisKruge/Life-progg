import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import * as schema from "./schema.js";
import { DEFAULT_AI_MODEL, DEFAULT_DIFFICULTY_REWARDS, DEFAULT_RANKS } from "../../shared/types.js";

export type AppDb = BetterSQLite3Database<typeof schema>;

/** Project-root `drizzle/` folder; the same relative hop works from `src/server/db` and `dist/server/db`. */
export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../drizzle");

export const LIFE_CATEGORIES = [
  { key: "wealth", name: "Wealth", description: "Money, saving, investing and financial freedom." },
  { key: "physique", name: "Physique", description: "Strength, fitness, health and energy." },
  { key: "mind", name: "Mind", description: "Learning, focus, reading and mental wellbeing." },
  { key: "empire", name: "Empire", description: "Career, business and building things." },
  { key: "life", name: "Life", description: "Relationships, home, adventure and joy." },
  { key: "discipline", name: "Discipline", description: "Consistency, routines and self-command." },
] as const;

export interface StoreOptions {
  /** SQLite file path, or ":memory:" for tests. */
  file: string;
  backupDir: string;
}

/**
 * Owns the SQLite connection. Restore swaps the underlying file, so callers must
 * always go through `store.db` rather than caching the Drizzle instance.
 */
export class Store {
  private sqliteConn!: Database.Database;
  private drizzleDb!: AppDb;
  readonly file: string;
  readonly backupDir: string;
  /** Path of a backup taken automatically before pending migrations ran, if any. */
  lastPreMigrationBackup: string | null = null;

  constructor(opts: StoreOptions) {
    this.file = opts.file;
    this.backupDir = opts.backupDir;
    this.open();
  }

  get db(): AppDb {
    return this.drizzleDb;
  }

  get sqlite(): Database.Database {
    return this.sqliteConn;
  }

  get inMemory(): boolean {
    return this.file === ":memory:";
  }

  /** Runs `fn` atomically. Nested calls become savepoints, so an inner failure never half-commits. */
  tx<T>(fn: () => T): T {
    return this.sqliteConn.transaction(fn).immediate();
  }

  open(): void {
    const existed = !this.inMemory && fs.existsSync(this.file);
    if (!this.inMemory) fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.sqliteConn = new Database(this.file);
    this.sqliteConn.pragma("foreign_keys = ON");
    this.sqliteConn.pragma("busy_timeout = 5000");
    if (!this.inMemory) this.sqliteConn.pragma("journal_mode = WAL");
    this.drizzleDb = drizzle(this.sqliteConn, { schema });

    if (existed && this.pendingMigrationCount() > 0) {
      // Never upgrade a user's database without a restorable copy of it first.
      this.lastPreMigrationBackup = this.snapshotTo(path.join(this.backupDir, backupFileName("pre-migration")));
    }
    migrate(this.drizzleDb, { migrationsFolder: MIGRATIONS_DIR });
    ensureDefaults(this.drizzleDb);
  }

  close(): void {
    if (this.sqliteConn?.open) this.sqliteConn.close();
  }

  /** Writes a consistent, compacted copy of the live database to `target`. */
  snapshotTo(target: string): string {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Never overwrite an existing backup: add a counter if two land in the same millisecond.
    const ext = path.extname(target);
    let file = target;
    for (let n = 1; fs.existsSync(file); n++) file = `${target.slice(0, -ext.length)}-${n}${ext}`;
    this.sqliteConn.prepare("VACUUM INTO ?").run(file);
    return file;
  }

  private pendingMigrationCount(): number {
    const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8")) as {
      entries: unknown[];
    };
    const hasTable = this.sqliteConn
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
      .get();
    if (!hasTable) return journal.entries.length;
    const { n } = this.sqliteConn.prepare("SELECT COUNT(*) AS n FROM __drizzle_migrations").get() as { n: number };
    return Math.max(0, journal.entries.length - n);
  }
}

export function backupFileName(kind: string, at = new Date()): string {
  return `levelone-${kind}-${at.toISOString().replace(/[:.]/g, "-")}.db`;
}

/** Inserts reference rows the app relies on. Idempotent; never overwrites user edits. */
function ensureDefaults(db: AppDb): void {
  const user = db.select().from(schema.users).where(eq(schema.users.id, 1)).get();
  if (!user) {
    db.insert(schema.users).values({ id: 1, displayName: "Player One" }).run();
  }
  const settings = db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, 1)).get();
  if (!settings) {
    db.insert(schema.userSettings)
      .values({ userId: 1, rankThresholds: DEFAULT_RANKS, difficultyRewards: DEFAULT_DIFFICULTY_REWARDS, aiModel: DEFAULT_AI_MODEL })
      .run();
  }
  LIFE_CATEGORIES.forEach((c, i) => {
    db.insert(schema.lifeCategories)
      .values({ ...c, sortOrder: i })
      .onConflictDoNothing({ target: schema.lifeCategories.key })
      .run();
  });
}
