import { describe, expect, it } from "vitest";
import { FIGHTERS } from "../src/game/data/fighters";
import { STAGES } from "../src/game/data/stages";
import { validateContent } from "../src/game/data/validate";
import { WEAPONS } from "../src/game/data/weapons";


describe("游戏内容完整性", () => {
  it("包含十架战机、六类武器、二十二关和独立 BOSS", () => {
    expect(FIGHTERS).toHaveLength(10);
    expect(WEAPONS).toHaveLength(6);
    expect(STAGES).toHaveLength(22);
    expect(new Set(STAGES.map((stage) => stage.bossName)).size).toBe(22);
    expect(validateContent()).toEqual([]);
  });

  it("每架战机具有三个等级和专属大招", () => {
    for (const fighter of FIGHTERS) {
      expect(fighter.levels).toHaveLength(3);
      expect(fighter.ultimate.name.length).toBeGreaterThan(3);
      expect(fighter.weaponAffinity).toHaveLength(2);
      fighter.levels.forEach((level, index) => {
        expect(Object.values(level.stats).reduce((sum, value) => sum + value, 0)).toBe(36 + index * 4);
      });
    }
  });

  it("六种武器拥有不同的攻击节奏", () => {
    expect(new Set(WEAPONS.map((weapon) => weapon.fireIntervalMs)).size).toBe(6);
    expect(new Set(WEAPONS.flatMap((weapon) => weapon.tags)).size).toBeGreaterThan(10);
  });
});
