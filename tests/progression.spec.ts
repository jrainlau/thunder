import { describe, expect, it } from "vitest";
import { FIGHTERS } from "../src/game/data/fighters";
import { isStageUnlocked, newlyUnlockedFighters, powerScore, upgradeCost } from "../src/game/data/progression";
import { STAGES } from "../src/game/data/stages";
import { createDefaultSave } from "../src/game/save/SaveService";
import type { SaveData, StageRecord } from "../src/game/types";

const cleared: StageRecord = { cleared: true, bestScore: 10000, bestRank: "A", bossCore: true, blackBox: false, bestBossTimeSeconds: 90, noDamageEliteWaves: 1, maxWeaponsCollected: 2 };
const stageAt = (index: number) => {
  const stage = STAGES[index];
  if (!stage) throw new Error(`缺少测试关卡：${index}`);
  return stage;
};

describe("成长与解锁", () => {
  it("升级成本固定且满级不可继续升级", () => {
    expect(upgradeCost(1)).toBe(120);
    expect(upgradeCost(2)).toBe(300);
    expect(upgradeCost(3)).toBe(0);
  });

  it("同等级战机功率差处于可调平衡区间", () => {
    for (const level of [1, 2, 3] as const) {
      const scores = FIGHTERS.map((fighter) => powerScore(fighter, level));
      const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
      expect(Math.max(...scores) / average).toBeLessThan(1.16);
      expect(Math.min(...scores) / average).toBeGreaterThan(0.84);
    }
  });

  it("常规关线性解锁，隐藏关使用明确条件", () => {
    const initial = createDefaultSave();
    expect(isStageUnlocked(stageAt(0), initial)).toBe(true);
    expect(isStageUnlocked(stageAt(1), initial)).toBe(false);
    const stageOneCleared: SaveData = { ...initial, stageRecords: { "stage-1": cleared } };
    expect(isStageUnlocked(stageAt(1), stageOneCleared)).toBe(true);
    const hiddenRecords = { "stage-7": { ...cleared, blackBox: true }, "stage-12": { ...cleared, blackBox: true }, "stage-17": { ...cleared, blackBox: true } };
    const hiddenReady: SaveData = { ...initial, stageRecords: hiddenRecords };
    expect(isStageUnlocked(stageAt(20), hiddenReady)).toBe(true);
  });

  it("雷针、幽影和北辰只在各自真实指标满足后解锁", () => {
    const initial = createDefaultSave();
    const qualifying: SaveData = {
      ...initial,
      stageRecords: {
        "stage-4": { ...cleared, bestBossTimeSeconds: 59 },
        "stage-5": { ...cleared, noDamageEliteWaves: 3 },
        "stage-6": { ...cleared, maxWeaponsCollected: 6 },
      },
    };
    const unlocked = newlyUnlockedFighters(qualifying);
    expect(unlocked).toContain("needle");
    expect(unlocked).toContain("phantom");
    expect(unlocked).toContain("polaris");
    expect(newlyUnlockedFighters(initial)).not.toContain("needle");
  });
});
