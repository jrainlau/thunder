import { FIGHTERS } from "./fighters";
import { STAGES } from "./stages";
import { WEAPONS } from "./weapons";
import { FIGHTER_IDS, WEAPON_IDS } from "../types";

export const validateContent = (): readonly string[] => {
  const errors: string[] = [];
  if (FIGHTERS.length !== 10) errors.push("战机数量必须为 10");
  if (WEAPONS.length !== 6) errors.push("武器数量必须为 6");
  if (STAGES.length !== 22) errors.push("关卡数量必须为 22");
  if (new Set(FIGHTERS.map((item) => item.id)).size !== FIGHTER_IDS.length) errors.push("战机 ID 重复或缺失");
  if (new Set(WEAPONS.map((item) => item.id)).size !== WEAPON_IDS.length) errors.push("武器 ID 重复或缺失");
  if (new Set(STAGES.map((item) => item.id)).size !== 22) errors.push("关卡 ID 重复");
  if (new Set(STAGES.map((item) => item.bossName)).size !== 22) errors.push("BOSS 必须全部独立");
  for (const fighter of FIGHTERS) {
    fighter.levels.forEach((definition, index) => {
      const total = Object.values(definition.stats).reduce((sum, value) => sum + value, 0);
      const expected = 36 + index * 4;
      if (total !== expected) errors.push(`${fighter.name} Lv.${index + 1} 六维总和应为 ${expected}`);
    });
  }
  return errors;
};
