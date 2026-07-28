import { FIGHTERS } from "./fighters";
import { STAGES } from "./stages";
import type { FighterDefinition, FighterId, FighterLevel, Rank, SaveData, StageDefinition, StageId } from "../types";

const RANK_ORDER: Readonly<Record<Rank, number>> = { C: 0, B: 1, A: 2, S: 3 };

export const upgradeCost = (level: FighterLevel): number => level === 1 ? 120 : level === 2 ? 300 : 0;

export const powerScore = (fighter: FighterDefinition, level: FighterLevel): number => {
  const definition = fighter.levels[level - 1];
  if (!definition) return 0;
  const { stats } = definition;
  const dps = (0.72 + 0.055 * stats.firepower) * (0.78 + 0.045 * stats.rate);
  const ehp = 70 + 10 * stats.armor;
  const mobility = 220 + 14 * stats.mobility;
  const energy = 4 + 0.8 * stats.energy;
  const luck = 0.88 + 0.027 * stats.luck;
  return Number((dps * 35 + ehp / 150 * 25 + mobility / 360 * 15 + energy / 12 * 15 + luck / 1.15 * 10).toFixed(2));
};

export const rankForScore = (score: number, durationSeconds: number, playerPower: number, stage: StageDefinition): Rank => {
  const baseline = stage.threat * 115;
  const correction = Math.min(1.15, Math.max(0.85, (stage.recommendedLevel === 1 ? 100 : stage.recommendedLevel === 2 ? 112 : 125) / playerPower));
  const timeBonus = Math.max(0, 120 - durationSeconds) * 35;
  const normalized = (score + timeBonus) * correction / baseline;
  if (normalized >= 1.3) return "S";
  if (normalized >= 1.0) return "A";
  if (normalized >= 0.7) return "B";
  return "C";
};

export const isStageUnlocked = (stage: StageDefinition, save: SaveData): boolean => {
  if (stage.order === 1) return true;
  if (stage.id === "hidden-1") {
    const blackBoxes = ["stage-7", "stage-12", "stage-17"].filter((id) => save.stageRecords[id as StageId]?.blackBox).length;
    const highRanks = Object.values(save.stageRecords).filter((record) => record && RANK_ORDER[record.bestRank] >= RANK_ORDER.A).length;
    return blackBoxes === 3 && highRanks >= 3;
  }
  if (stage.id === "hidden-2") {
    const regularClears = STAGES.filter((item) => !item.hidden).filter((item) => save.stageRecords[item.id]?.cleared).length;
    return regularClears === 20 && save.stageRecords["hidden-1"]?.cleared === true;
  }
  const previous = `stage-${stage.order - 1}` as StageId;
  return save.stageRecords[previous]?.cleared === true;
};

export const newlyUnlockedFighters = (save: SaveData): readonly FighterId[] => FIGHTERS.filter((fighter) => {
  if (save.unlockedFighters.includes(fighter.id)) return false;
  const records = save.stageRecords;
  switch (fighter.id) {
    case "bulwark": return records["stage-3"]?.bestRank === "A" || records["stage-3"]?.bestRank === "S";
    case "needle": return (records["stage-4"]?.bestBossTimeSeconds ?? 9999) <= 60;
    case "prism": return Object.values(records).filter((record) => record?.bossCore).length >= 6;
    case "phantom": return Object.values(records).reduce((sum, record) => sum + (record?.noDamageEliteWaves ?? 0), 0) >= 3;
    case "core": return records["stage-10"]?.cleared === true;
    case "polaris": return Object.values(records).some((record) => (record?.maxWeaponsCollected ?? 0) >= 6);
    case "eclipse": return Object.values(records).filter((record) => record?.bestRank === "S").length >= 3;
    case "titan": return records["stage-15"]?.cleared === true;
    case "relic": return save.unlockedFighters.length >= 9 && records["hidden-1"]?.cleared === true;
    case "falcon": return false;
  }
}).map((fighter) => fighter.id);
