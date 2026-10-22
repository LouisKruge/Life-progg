import { describe, expect, it } from "vitest";
import { cumulativeXpForLevel, DEFAULT_RANKS, levelFromXp, rankForLevel, xpToAdvance } from "../../src/shared/types.js";

describe("level formula", () => {
  it("uses 500 + 150(L-1) + 25(L-1)^2 to advance from L to L+1", () => {
    expect(xpToAdvance(1)).toBe(500);
    expect(xpToAdvance(2)).toBe(675);
    expect(xpToAdvance(3)).toBe(900);
    expect(xpToAdvance(10)).toBe(500 + 150 * 9 + 25 * 81);
  });

  it("computes cumulative thresholds", () => {
    expect(cumulativeXpForLevel(1)).toBe(0);
    expect(cumulativeXpForLevel(2)).toBe(500);
    expect(cumulativeXpForLevel(3)).toBe(1175);
    expect(cumulativeXpForLevel(4)).toBe(2075);
  });

  it("places XP on the right level at and around every boundary", () => {
    expect(levelFromXp(0)).toMatchObject({ level: 1, xpIntoLevel: 0, xpForNextLevel: 500, levelStartXp: 0 });
    expect(levelFromXp(499).level).toBe(1);
    expect(levelFromXp(500)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNextLevel: 675 });
    expect(levelFromXp(1174).level).toBe(2);
    expect(levelFromXp(1175).level).toBe(3);
    for (let l = 1; l <= 60; l++) {
      expect(levelFromXp(cumulativeXpForLevel(l)).level).toBe(l);
      expect(levelFromXp(cumulativeXpForLevel(l + 1) - 1).level).toBe(l);
    }
  });

  it("never goes below level 1", () => {
    expect(levelFromXp(-50)).toMatchObject({ level: 1, totalXp: 0 });
  });
});

describe("ranks", () => {
  it("maps levels to configurable rank titles", () => {
    expect(rankForLevel(1, DEFAULT_RANKS)).toEqual({ current: "Initiate", next: { title: "Apprentice", minLevel: 5 } });
    expect(rankForLevel(10, DEFAULT_RANKS).current).toBe("Builder");
    expect(rankForLevel(99, DEFAULT_RANKS)).toEqual({ current: "Legend", next: null });
    expect(rankForLevel(3, [{ title: "Zero", minLevel: 1 }, { title: "Hero", minLevel: 3 }]).current).toBe("Hero");
  });
});
