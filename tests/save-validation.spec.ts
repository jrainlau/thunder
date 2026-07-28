import { describe, expect, it } from "vitest";
import { createDefaultSave, validateSave } from "../src/game/save/SaveService";


describe("安全存档", () => {
  it("接受默认存档", () => {
    expect(validateSave(createDefaultSave())).toEqual(createDefaultSave());
  });

  it("拒绝越界等级和负资源", () => {
    const save = createDefaultSave();
    expect(validateSave({ ...save, tacticalData: -1 })).toBeUndefined();
    expect(validateSave({ ...save, fighterLevels: { ...save.fighterLevels, falcon: 4 } })).toBeUndefined();
  });

  it("过滤未知 ID、限制档案数量并阻止选中锁定战机", () => {
    const save = createDefaultSave();
    const parsed = validateSave({ ...save, selectedFighter: "relic", unlockedFighters: ["relic", "invalid"], discoveredWeapons: ["pulse", "unknown"], archiveIds: Array.from({ length: 250 }, (_, index) => `entry-${index}`) });
    expect(parsed?.selectedFighter).toBe("falcon");
    expect(parsed?.unlockedFighters).toEqual(["falcon"]);
    expect(parsed?.discoveredWeapons).toEqual(["pulse"]);
    expect(parsed?.archiveIds).toHaveLength(200);
  });
});
