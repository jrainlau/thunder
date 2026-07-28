export type FighterId = "falcon" | "bulwark" | "needle" | "prism" | "phantom" | "core" | "polaris" | "eclipse" | "titan" | "relic";
export type FighterLevel = 1 | 2 | 3;
export type WeaponId = "pulse" | "laser" | "drone" | "scatter" | "missile" | "rail";
export type WeaponLevel = 1 | 2 | 3;
export type StageId = `stage-${number}` | "hidden-1" | "hidden-2";
export type Rank = "C" | "B" | "A" | "S";
export type ScreenId = "menu" | "hangar" | "map" | "battle" | "result" | "archive";

export interface FighterStats {
  readonly firepower: number;
  readonly rate: number;
  readonly mobility: number;
  readonly armor: number;
  readonly energy: number;
  readonly luck: number;
}

export interface FighterLevelDefinition {
  readonly level: FighterLevel;
  readonly stats: FighterStats;
  readonly powerBudget: number;
  readonly passive: string;
  readonly form: string;
}

export interface FighterDefinition {
  readonly id: FighterId;
  readonly name: string;
  readonly callsign: string;
  readonly role: string;
  readonly color: number;
  readonly colorCss: string;
  readonly accentCss: string;
  readonly weaponAffinity: readonly WeaponId[];
  readonly levels: readonly [FighterLevelDefinition, FighterLevelDefinition, FighterLevelDefinition];
  readonly ultimate: UltimateDefinition;
  readonly unlockText: string;
  readonly lore: string;
}

export interface UltimateDefinition {
  readonly name: string;
  readonly description: string;
  readonly durationMs: number;
  readonly bossDamageCap: number;
  readonly color: number;
}

export interface WeaponDefinition {
  readonly id: WeaponId;
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly baseDamage: number;
  readonly fireIntervalMs: number;
  readonly color: number;
  readonly colorCss: string;
}

export interface StageDefinition {
  readonly id: StageId;
  readonly order: number;
  readonly act: number;
  readonly name: string;
  readonly location: string;
  readonly mechanic: string;
  readonly bossName: string;
  readonly bossTitle: string;
  readonly bossColor: number;
  readonly recommendedLevel: FighterLevel;
  readonly threat: number;
  readonly briefing: string;
  readonly bossQuote: string;
  readonly archive: string;
  readonly hidden: boolean;
}

export interface StoryCharacter {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly quote: string;
  readonly color: string;
}

export interface StageRecord {
  readonly cleared: boolean;
  readonly bestScore: number;
  readonly bestRank: Rank;
  readonly bossCore: boolean;
  readonly blackBox: boolean;
  readonly bestBossTimeSeconds: number;
  readonly noDamageEliteWaves: number;
  readonly maxWeaponsCollected: number;
}

export interface SaveData {
  readonly version: 1;
  readonly tacticalData: number;
  readonly starCoins: number;
  readonly selectedFighter: FighterId;
  readonly fighterLevels: Readonly<Record<FighterId, FighterLevel>>;
  readonly unlockedFighters: readonly FighterId[];
  readonly discoveredWeapons: readonly WeaponId[];
  readonly stageRecords: Readonly<Partial<Record<StageId, StageRecord>>>;
  readonly archiveIds: readonly string[];
  readonly muted: boolean;
  readonly reducedMotion: boolean;
}

export interface BattleResult {
  readonly victory: boolean;
  readonly stageId: StageId;
  readonly score: number;
  readonly rank: Rank;
  readonly tacticalData: number;
  readonly defeated: number;
  readonly grazes: number;
  readonly durationSeconds: number;
  readonly bossDurationSeconds: number;
  readonly noDamageEliteWaves: number;
  readonly collectedWeaponTypes: number;
  readonly weaponUsage: Readonly<Partial<Record<WeaponId, number>>>;
}

export interface BattleLaunch {
  readonly stage: StageDefinition;
  readonly fighter: FighterDefinition;
  readonly fighterLevel: FighterLevel;
  readonly firstClear: boolean;
}

export const FIGHTER_IDS: readonly FighterId[] = ["falcon", "bulwark", "needle", "prism", "phantom", "core", "polaris", "eclipse", "titan", "relic"];
export const WEAPON_IDS: readonly WeaponId[] = ["pulse", "laser", "drone", "scatter", "missile", "rail"];
