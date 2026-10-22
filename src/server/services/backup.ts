import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { desc, eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import * as schema from "../db/schema.js";
import { backupFileName } from "../db/store.js";
import type { BackupInfo } from "../../shared/types.js";
import { badRequest, conflict, notFound } from "../errors.js";

const SAFE_NAME = /^levelone-[a-z-]+-[0-9TZ-]+\.db$/;

function verifyFile(file: string): boolean {
  let conn: Database.Database | null = null;
  try {
    conn = new Database(file, { readonly: true, fileMustExist: true });
    const res = conn.pragma("integrity_check", { simple: true });
    const hasUsers = conn.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
    return res === "ok" && Boolean(hasUsers);
  } catch {
    return false;
  } finally {
    conn?.close();
  }
}

function record(ctx: AppContext, file: string, kind: BackupInfo["kind"]): BackupInfo {
  const row = ctx.store.db
    .insert(schema.backupMetadata)
    .values({ fileName: path.basename(file), kind, sizeBytes: fs.statSync(file).size, integrityOk: verifyFile(file), createdAt: ctx.clock.now().toISOString() })
    .returning()
    .get();
  return row;
}

export function createBackup(ctx: AppContext, kind: BackupInfo["kind"] = "manual"): BackupInfo {
  if (ctx.store.inMemory) throw conflict("IN_MEMORY", "An in-memory database cannot be backed up.");
  const file = ctx.store.snapshotTo(path.join(ctx.store.backupDir, backupFileName(kind, ctx.clock.now())));
  return record(ctx, file, kind);
}

/** Records the automatic pre-migration backup (taken before the metadata table could be written). */
export function registerPreMigrationBackup(ctx: AppContext): void {
  const file = ctx.store.lastPreMigrationBackup;
  if (file && fs.existsSync(file)) {
    const exists = ctx.store.db.select().from(schema.backupMetadata).where(eq(schema.backupMetadata.fileName, path.basename(file))).get();
    if (!exists) record(ctx, file, "pre-migration");
  }
}

export function listBackups(ctx: AppContext): BackupInfo[] {
  return ctx.store.db
    .select()
    .from(schema.backupMetadata)
    .orderBy(desc(schema.backupMetadata.createdAt), desc(schema.backupMetadata.id))
    .all()
    .filter((b) => fs.existsSync(path.join(ctx.store.backupDir, b.fileName)));
}

/**
 * Restores a backup. The current database is snapshotted first, the backup is verified
 * before anything is replaced, and the backup list is preserved across the swap.
 */
export function restoreBackup(ctx: AppContext, fileName: string, onRestored?: (ctx: AppContext) => void): { restored: string; safetyBackup: string } {
  if (!SAFE_NAME.test(fileName)) throw badRequest("INVALID_BACKUP_NAME", "That is not a LEVEL ONE backup file name.");
  const source = path.join(ctx.store.backupDir, fileName);
  if (!fs.existsSync(source)) throw notFound("Backup");
  if (!verifyFile(source)) throw conflict("BACKUP_CORRUPT", "The backup failed its integrity check; nothing was changed.");

  const safety = createBackup(ctx, "pre-restore");
  const knownBackups = listBackups(ctx);

  ctx.store.close();
  const target = ctx.store.file;
  try {
    for (const suffix of ["-wal", "-shm"]) fs.rmSync(target + suffix, { force: true });
    fs.copyFileSync(source, target);
  } finally {
    // Reopen in every case; open() also runs any migrations the older backup is missing.
    ctx.store.open();
  }
  // Keep the backup catalogue complete even though the restored file has an older copy of it.
  for (const b of knownBackups) {
    ctx.store.db
      .insert(schema.backupMetadata)
      .values({ fileName: b.fileName, kind: b.kind, sizeBytes: b.sizeBytes, integrityOk: b.integrityOk, createdAt: b.createdAt })
      .onConflictDoNothing({ target: schema.backupMetadata.fileName })
      .run();
  }
  // An older backup may predate newer built-in definitions.
  onRestored?.(ctx);
  return { restored: fileName, safetyBackup: safety.fileName };
}

/** Full JSON export of every user table. API keys are never included. */
export function exportJson(ctx: AppContext): Record<string, unknown> {
  const db = ctx.store.db;
  const settings = db.select().from(schema.userSettings).all().map(({ anthropicApiKey: _k, ...rest }) => rest);
  return {
    format: "level-one-export",
    version: 1,
    exportedAt: ctx.clock.now().toISOString(),
    data: {
      users: db.select().from(schema.users).all(),
      userSettings: settings,
      lifeCategories: db.select().from(schema.lifeCategories).all(),
      quests: db.select().from(schema.quests).all(),
      questInstances: db.select().from(schema.questInstances).all(),
      questCompletions: db.select().from(schema.questCompletions).all(),
      xpTransactions: db.select().from(schema.xpTransactions).all(),
      creditTransactions: db.select().from(schema.creditTransactions).all(),
      rewards: db.select().from(schema.rewards).all(),
      achievements: db.select().from(schema.achievements).all(),
      achievementUnlocks: db.select().from(schema.achievementUnlocks).all(),
      seasons: db.select().from(schema.seasons).all(),
      seasonGoals: db.select().from(schema.seasonGoals).all(),
      financialAccounts: db.select().from(schema.financialAccounts).all(),
      financialTransactions: db.select().from(schema.financialTransactions).all(),
      savingsGoals: db.select().from(schema.savingsGoals).all(),
      timelineEvents: db.select().from(schema.timelineEvents).all(),
    },
  };
}
