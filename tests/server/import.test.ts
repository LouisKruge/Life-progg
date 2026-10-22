import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeCtx, tempDir } from "../helpers.js";
import { AppError } from "../../src/server/errors.js";
import { exportJson, importJson, listBackups, restoreBackup } from "../../src/server/services/backup.js";
import { bootstrap } from "../../src/server/bootstrap.js";
import { completeOnboarding } from "../../src/server/services/onboarding.js";
import { completeInstance, createQuest, listInstancesForDate, listQuests } from "../../src/server/services/quests.js";
import { creditBalance, totalXp } from "../../src/server/services/progression.js";
import { getApiKey, getSettings, updateSettings } from "../../src/server/services/settings.js";
import { createReward, redeemReward } from "../../src/server/services/rewards.js";
import { listAchievements } from "../../src/server/services/achievements.js";
import { createSeason } from "../../src/server/services/seasons.js";

function fileCtx() {
  const dir = tempDir();
  return makeCtx({ file: path.join(dir, "levelone.db"), backupDir: path.join(dir, "backups") });
}

function populated() {
  const ctx = fileCtx();
  completeOnboarding(ctx, { displayName: "Louis", finances: { startingSavingsCents: 600_000, firstMilestoneCents: 2_000_000 } });
  const q = createQuest(ctx, { title: "Train", difficulty: "medium", frequency: "daily" });
  completeInstance(ctx, listInstancesForDate(ctx, "2026-10-22").find((i) => i.quest.id === q.id)!.instanceId);
  const r = createReward(ctx, { name: "Coffee", creditPrice: 5 });
  redeemReward(ctx, r.id, { requestId: "req-12345678" });
  createSeason(ctx, { name: "Foundation", startDate: "2026-10-22", activate: true });
  return ctx;
}

describe("JSON export and import", () => {
  it("round-trips every record into another installation", () => {
    const source = populated();
    const exported = JSON.parse(JSON.stringify(exportJson(source)));
    const target = fileCtx();
    updateSettings(target, { displayName: "Someone else", anthropicApiKey: "sk-ant-keep-this-key" });
    const res = importJson(target, exported, bootstrap);
    expect(res.rows).toBeGreaterThan(20);
    expect(getSettings(target)).toMatchObject({ displayName: "Louis", onboarded: true });
    expect(totalXp(target)).toBe(totalXp(source));
    expect(creditBalance(target)).toBe(creditBalance(source));
    expect(listQuests(target).map((q) => q.title)).toEqual(["Train"]);
    expect(listAchievements(target).find((a) => a.key === "first_quest")?.unlockedAt).not.toBeNull();
    // The local API key survives even though exports never contain it.
    expect(getApiKey(target)).toBe("sk-ant-keep-this-key");
    expect(JSON.stringify(exported)).not.toContain("sk-ant");

    // The import can be undone from the automatic safety copy.
    restoreBackup(target, res.safetyBackup, bootstrap);
    expect(getSettings(target).displayName).toBe("Someone else");
    expect(listBackups(target).some((b) => b.kind === "import")).toBe(true);
    source.store.close();
    target.store.close();
  });

  it("rejects malformed or inconsistent files without changing anything", () => {
    const ctx = populated();
    const before = totalXp(ctx);
    const code = (payload: unknown) => {
      try {
        importJson(ctx, payload, bootstrap);
      } catch (e) {
        expect(e).toBeInstanceOf(AppError);
        return (e as AppError).code;
      }
      throw new Error("expected error");
    };
    expect(code({ hello: "world" })).toBe("IMPORT_INVALID");
    expect(code({ format: "level-one-export", version: 99, data: {} })).toBe("IMPORT_TOO_NEW");
    const broken = JSON.parse(JSON.stringify(exportJson(ctx)));
    broken.data.questCompletions[0].instanceId = 9999; // dangling reference
    expect(code(broken)).toBe("IMPORT_INCONSISTENT");
    const wrongShape = JSON.parse(JSON.stringify(exportJson(ctx)));
    wrongShape.data.quests = "nope";
    expect(code(wrongShape)).toBe("IMPORT_INVALID");
    expect(totalXp(ctx)).toBe(before);
    expect(getSettings(ctx).displayName).toBe("Louis");
    ctx.store.close();
  });
});
