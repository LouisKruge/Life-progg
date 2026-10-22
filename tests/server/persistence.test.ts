import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { makeCtx, tempDir, TestClock, START } from "../helpers.js";
import { completeInstance, createQuest, listInstancesForDate } from "../../src/server/services/quests.js";
import { creditBalance, totalXp } from "../../src/server/services/progression.js";
import { createBackup, exportJson, listBackups, restoreBackup } from "../../src/server/services/backup.js";
import { completeOnboarding } from "../../src/server/services/onboarding.js";
import { getSettings, updateSettings } from "../../src/server/services/settings.js";
import { Store } from "../../src/server/db/store.js";
import { AppError } from "../../src/server/errors.js";

function fileCtx() {
  const dir = tempDir();
  const file = path.join(dir, "levelone.db");
  const backupDir = path.join(dir, "backups");
  return { dir, file, backupDir, ctx: makeCtx({ file, backupDir }) };
}

describe("persistence", () => {
  it("keeps all data after the database is closed and reopened", () => {
    const { file, backupDir, ctx } = fileCtx();
    completeOnboarding(ctx, { displayName: "Louis" });
    const q = createQuest(ctx, { title: "Read", difficulty: "medium", frequency: "daily" });
    completeInstance(ctx, listInstancesForDate(ctx, "2026-10-22")[0]!.instanceId);
    ctx.store.close();

    const reopened = makeCtx({ file, backupDir, clock: new TestClock(new Date(START)) });
    expect(getSettings(reopened).displayName).toBe("Louis");
    expect(getSettings(reopened).onboarded).toBe(true);
    expect(totalXp(reopened)).toBe(100);
    expect(creditBalance(reopened)).toBe(10);
    expect(listInstancesForDate(reopened, "2026-10-22").find((i) => i.quest.id === q.id)?.status).toBe("completed");
    reopened.store.close();
  });

  it("takes a backup before migrating an existing database that is behind", () => {
    const { file, backupDir, ctx } = fileCtx();
    ctx.store.close();
    // Simulate an older install by forgetting the applied migration record.
    const raw = new Database(file);
    raw.exec("DELETE FROM __drizzle_migrations");
    raw.close();
    // Re-applying the initial migration would fail on existing tables, so expect the open to throw -
    // but only after the safety copy exists.
    expect(() => new Store({ file, backupDir })).toThrow();
    const copies = fs.readdirSync(backupDir).filter((f) => f.includes("pre-migration"));
    expect(copies.length).toBe(1);
  });

  it("does not back up a fresh database or one that is already up to date", () => {
    const { file, backupDir, ctx } = fileCtx();
    ctx.store.close();
    const again = new Store({ file, backupDir });
    expect(again.lastPreMigrationBackup).toBeNull();
    again.close();
    expect(fs.existsSync(backupDir)).toBe(false);
  });
});

describe("backup and restore", () => {
  it("restores an earlier state and keeps a safety copy of the current one", () => {
    const { ctx } = fileCtx();
    updateSettings(ctx, { displayName: "Before" });
    createQuest(ctx, { title: "One", difficulty: "easy", frequency: "daily" });
    completeInstance(ctx, listInstancesForDate(ctx, "2026-10-22")[0]!.instanceId);
    const backup = createBackup(ctx);
    expect(backup.integrityOk).toBe(true);

    ctx.clock.advanceHours(1);
    updateSettings(ctx, { displayName: "After" });
    createQuest(ctx, { title: "Two", difficulty: "hard", frequency: "once" });
    completeInstance(ctx, listInstancesForDate(ctx, "2026-10-22").find((i) => i.quest.title === "Two")!.instanceId);
    expect(totalXp(ctx)).toBe(250);

    const result = restoreBackup(ctx, backup.fileName);
    expect(getSettings(ctx).displayName).toBe("Before");
    expect(totalXp(ctx)).toBe(50);
    // Both the original backup and the automatic pre-restore copy remain listed.
    const names = listBackups(ctx).map((b) => b.fileName);
    expect(names).toContain(backup.fileName);
    expect(names).toContain(result.safetyBackup);

    // The safety copy can undo the restore.
    restoreBackup(ctx, result.safetyBackup);
    expect(getSettings(ctx).displayName).toBe("After");
    expect(totalXp(ctx)).toBe(250);
    ctx.store.close();
  });

  it("refuses corrupt backups and path tricks without touching the live data", () => {
    const { ctx, backupDir } = fileCtx();
    updateSettings(ctx, { displayName: "Safe" });
    fs.mkdirSync(backupDir, { recursive: true });
    const bad = "levelone-manual-2026-10-22T08-00-00-000Z.db";
    fs.writeFileSync(path.join(backupDir, bad), "not a database");
    expect(() => restoreBackup(ctx, bad)).toThrow(AppError);
    expect(() => restoreBackup(ctx, "../levelone.db")).toThrow(AppError);
    expect(getSettings(ctx).displayName).toBe("Safe");
    ctx.store.close();
  });

  it("exports JSON without the API key", () => {
    const ctx = makeCtx();
    updateSettings(ctx, { anthropicApiKey: "sk-ant-secret-key-123" });
    const json = JSON.stringify(exportJson(ctx));
    expect(json).not.toContain("sk-ant-secret");
    expect(json).toContain("level-one-export");
  });
});
