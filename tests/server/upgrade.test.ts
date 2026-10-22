import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { MIGRATIONS_DIR, Store } from "../../src/server/db/store.js";
import { tempDir, makeCtx } from "../helpers.js";
import { getSettings } from "../../src/server/services/settings.js";
import { totalXp } from "../../src/server/services/progression.js";
import { listQuests } from "../../src/server/services/quests.js";

/** Builds a database exactly as the first release (migration 0000 only) left it. */
function firstReleaseDb(file: string) {
  const dir = tempDir();
  const migrations = path.join(dir, "drizzle");
  fs.mkdirSync(path.join(migrations, "meta"), { recursive: true });
  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"));
  const first = journal.entries[0];
  fs.writeFileSync(path.join(migrations, "meta/_journal.json"), JSON.stringify({ ...journal, entries: [first] }));
  fs.copyFileSync(path.join(MIGRATIONS_DIR, `${first.tag}.sql`), path.join(migrations, `${first.tag}.sql`));
  const sqlite = new Database(file);
  migrate(drizzle(sqlite), { migrationsFolder: migrations });
  sqlite.exec(`
    INSERT INTO users (id, display_name, onboarded_at) VALUES (1, 'Louis', '2026-10-01T00:00:00Z');
    INSERT INTO user_settings (user_id, rank_thresholds, difficulty_rewards) VALUES (1, '[{"title":"Initiate","minLevel":1}]', '{"trivial":{"xp":25,"credits":2},"easy":{"xp":50,"credits":5},"medium":{"xp":100,"credits":10},"hard":{"xp":200,"credits":20},"epic":{"xp":400,"credits":40}}');
    INSERT INTO quests (title, xp_reward, credit_reward, frequency) VALUES ('Old quest', 100, 10, 'daily');
    INSERT INTO xp_transactions (amount, source_type, idempotency_key) VALUES (750, 'adjustment', 'legacy-1');
  `);
  sqlite.close();
}

describe("upgrading an existing database", () => {
  it("applies new migrations in place, keeps every record and backs up first", () => {
    const dir = tempDir();
    const file = path.join(dir, "levelone.db");
    const backupDir = path.join(dir, "backups");
    firstReleaseDb(file);

    const ctx = makeCtx({ file, backupDir });
    expect(ctx.store.lastPreMigrationBackup).not.toBeNull();
    expect(fs.readdirSync(backupDir).some((f) => f.includes("pre-migration"))).toBe(true);
    expect(getSettings(ctx)).toMatchObject({ displayName: "Louis", onboarded: true, emergencyFundMonths: 3 });
    expect(totalXp(ctx)).toBe(750);
    expect(listQuests(ctx).map((q) => q.title)).toEqual(["Old quest"]);
    ctx.store.close();

    // Opening again is a no-op: no further backups.
    const again = new Store({ file, backupDir });
    expect(again.lastPreMigrationBackup).toBeNull();
    again.close();
  });
});
