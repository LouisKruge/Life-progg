import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { desc, eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import * as schema from "../db/schema.js";
import { backupFileName, Store } from "../db/store.js";
import type { BackupInfo } from "../../shared/types.js";
import { badRequest, conflict, notFound } from "../errors.js";
import { getApiKey, updateSettings } from "./settings.js";

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

/**
 * Every user table, parents before children so an import can insert in this order.
 * backup_metadata is excluded: it describes files on this machine, not user data.
 */
const EXPORT_TABLES = [
  ["users", schema.users],
  ["userSettings", schema.userSettings],
  ["lifeCategories", schema.lifeCategories],
  ["seasons", schema.seasons],
  ["seasonGoals", schema.seasonGoals],
  ["seasonReviews", schema.seasonReviews],
  ["quests", schema.quests],
  ["questInstances", schema.questInstances],
  ["questCompletions", schema.questCompletions],
  ["xpTransactions", schema.xpTransactions],
  ["creditTransactions", schema.creditTransactions],
  ["rewards", schema.rewards],
  ["rewardBudgetPeriods", schema.rewardBudgetPeriods],
  ["rewardRedemptions", schema.rewardRedemptions],
  ["achievements", schema.achievements],
  ["achievementUnlocks", schema.achievementUnlocks],
  ["skillNodes", schema.skillNodes],
  ["skillProgress", schema.skillProgress],
  ["financialAccounts", schema.financialAccounts],
  ["financialTransactions", schema.financialTransactions],
  ["recurringTransactions", schema.recurringTransactions],
  ["budgets", schema.budgets],
  ["savingsGoals", schema.savingsGoals],
  ["debts", schema.debts],
  ["debtPayments", schema.debtPayments],
  ["timelineEvents", schema.timelineEvents],
  ["aiConversations", schema.aiConversations],
  ["aiMessages", schema.aiMessages],
  ["aiProposals", schema.aiProposals],
] as const;

export const EXPORT_FORMAT = "level-one-export";
export const EXPORT_VERSION = 2;

/** Full JSON export of every user table. API keys are never included. */
export function exportJson(ctx: AppContext): Record<string, unknown> {
  const data: Record<string, unknown[]> = {};
  for (const [name, table] of EXPORT_TABLES) {
    const rows = ctx.store.db.select().from(table).all() as Record<string, unknown>[];
    data[name] = name === "userSettings" ? rows.map(({ anthropicApiKey: _k, ...rest }) => rest) : rows;
  }
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: ctx.clock.now().toISOString(), data };
}

/**
 * Imports a JSON export by building a brand-new database file from it, verifying that file,
 * and then restoring it like a backup. The current data is backed up first, so an import can
 * always be undone from Settings → Backups. A malformed file changes nothing.
 */
export function importJson(ctx: AppContext, payload: unknown, onRestored?: (ctx: AppContext) => void): { restored: string; safetyBackup: string; rows: number } {
  if (ctx.store.inMemory) throw conflict("IN_MEMORY", "Import needs a file-backed database.");
  const p = payload as { format?: unknown; version?: unknown; data?: unknown };
  if (!p || p.format !== EXPORT_FORMAT || typeof p.data !== "object" || p.data === null) {
    throw badRequest("IMPORT_INVALID", "That file isn't a LEVEL ONE export.");
  }
  if (typeof p.version !== "number" || p.version > EXPORT_VERSION) {
    throw badRequest("IMPORT_TOO_NEW", "That export was made by a newer version of LEVEL ONE. Update the app first.");
  }
  const data = p.data as Record<string, unknown>;
  const fileName = backupFileName("import", ctx.clock.now());
  const target = path.join(ctx.store.backupDir, fileName);
  fs.mkdirSync(ctx.store.backupDir, { recursive: true });

  // Build in a scratch store so the live database is untouched until the file is proven good.
  const scratch = new Store({ file: target, backupDir: path.join(ctx.store.backupDir, "scratch") });
  let rows = 0;
  try {
    // A fresh store seeds defaults; clear them so the export's rows are the only data.
    scratch.sqlite.pragma("foreign_keys = OFF");
    scratch.tx(() => {
      for (const [, table] of [...EXPORT_TABLES].reverse()) scratch.db.delete(table).run();
      for (const [name, table] of EXPORT_TABLES) {
        const list = data[name];
        if (list === undefined) continue; // older exports lack newer tables
        if (!Array.isArray(list)) throw badRequest("IMPORT_INVALID", `“${name}” in the export is not a list.`);
        for (const row of list) {
          if (typeof row !== "object" || row === null) throw badRequest("IMPORT_INVALID", `A row in “${name}” is malformed.`);
          scratch.db.insert(table).values(row as never).run();
          rows++;
        }
      }
    });
    scratch.sqlite.pragma("foreign_keys = ON");
    const fkProblems = scratch.sqlite.pragma("foreign_key_check") as unknown[];
    if (fkProblems.length > 0) throw badRequest("IMPORT_INCONSISTENT", "The export has broken references between records; nothing was changed.");
    if (!scratch.db.select().from(schema.users).get()) throw badRequest("IMPORT_INVALID", "The export contains no user profile.");
    scratch.sqlite.pragma("wal_checkpoint(TRUNCATE)");
  } catch (err) {
    scratch.close();
    for (const f of [target, `${target}-wal`, `${target}-shm`]) fs.rmSync(f, { force: true });
    if (err instanceof Error && !(err as { code?: string }).code?.startsWith?.("SQLITE")) throw err;
    throw badRequest("IMPORT_INVALID", "The export contains data that doesn't fit the database; nothing was changed.");
  }
  scratch.close();
  for (const f of [`${target}-wal`, `${target}-shm`]) fs.rmSync(f, { force: true });
  fs.rmSync(path.join(ctx.store.backupDir, "scratch"), { recursive: true, force: true });

  record(ctx, target, "import");
  // Exports never contain the API key, so keep the one already configured on this machine.
  const apiKey = getApiKey(ctx);
  const res = restoreBackup(ctx, fileName, onRestored);
  if (apiKey) updateSettings(ctx, { anthropicApiKey: apiKey });
  return { ...res, rows };
}
