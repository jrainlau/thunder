import { FIGHTER_IDS, WEAPON_IDS, type FighterId, type FighterLevel, type SaveData, type StageId, type StageRecord, type WeaponId } from "../types";

const SAVE_KEY = "zero-boundary-echo.save.v1";
const BACKUP_KEY = `${SAVE_KEY}.backup`;
const TEMP_KEY = `${SAVE_KEY}.temp`;

const defaultLevels = (): Record<FighterId, FighterLevel> => Object.fromEntries(FIGHTER_IDS.map((id) => [id, 1])) as Record<FighterId, FighterLevel>;

export const createDefaultSave = (): SaveData => ({
  version: 1,
  tacticalData: 0,
  starCoins: 0,
  selectedFighter: "falcon",
  fighterLevels: defaultLevels(),
  unlockedFighters: ["falcon"],
  discoveredWeapons: ["pulse"],
  stageRecords: {},
  archiveIds: ["world-prologue"],
  muted: false,
  reducedMotion: false,
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isFighterId = (value: unknown): value is FighterId => typeof value === "string" && FIGHTER_IDS.some((id) => id === value);
const isWeaponId = (value: unknown): value is WeaponId => typeof value === "string" && WEAPON_IDS.some((id) => id === value);
const isLevel = (value: unknown): value is FighterLevel => value === 1 || value === 2 || value === 3;

const parseStageRecord = (value: unknown): StageRecord | undefined => {
  if (!isRecord(value)) return undefined;
  const { cleared, bestScore, bestRank, bossCore, blackBox } = value;
  if (typeof cleared !== "boolean" || typeof bestScore !== "number" || !Number.isFinite(bestScore) || bestScore < 0 || !["C", "B", "A", "S"].includes(String(bestRank)) || typeof bossCore !== "boolean" || typeof blackBox !== "boolean") return undefined;
  const safeMetric = (candidate: unknown, fallback: number, maximum: number): number => typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 ? Math.min(maximum, Math.floor(candidate)) : fallback;
  return {
    cleared,
    bestScore: Math.floor(bestScore),
    bestRank: String(bestRank) as StageRecord["bestRank"],
    bossCore,
    blackBox,
    bestBossTimeSeconds: safeMetric(value.bestBossTimeSeconds, 9999, 9999),
    noDamageEliteWaves: safeMetric(value.noDamageEliteWaves, 0, 999),
    maxWeaponsCollected: safeMetric(value.maxWeaponsCollected, 0, WEAPON_IDS.length),
  };
};

export const validateSave = (value: unknown): SaveData | undefined => {
  if (!isRecord(value) || value.version !== 1 || !isFighterId(value.selectedFighter)) return undefined;
  if (typeof value.tacticalData !== "number" || !Number.isFinite(value.tacticalData) || value.tacticalData < 0 || typeof value.starCoins !== "number" || !Number.isFinite(value.starCoins) || value.starCoins < 0) return undefined;
  if (!isRecord(value.fighterLevels) || !Array.isArray(value.unlockedFighters) || !Array.isArray(value.discoveredWeapons) || !isRecord(value.stageRecords) || !Array.isArray(value.archiveIds)) return undefined;
  const fighterLevels = defaultLevels();
  for (const id of FIGHTER_IDS) {
    const candidate = value.fighterLevels[id];
    if (!isLevel(candidate)) return undefined;
    fighterLevels[id] = candidate;
  }
  const requestedUnlockedFighters = [...new Set<FighterId>(["falcon", ...value.unlockedFighters.filter(isFighterId)])];
  const discoveredWeapons = [...new Set(value.discoveredWeapons.filter(isWeaponId))];
  const stageRecords: Partial<Record<StageId, StageRecord>> = {};
  for (const [id, record] of Object.entries(value.stageRecords).slice(0, 22)) {
    const parsed = parseStageRecord(record);
    if (parsed && (/^stage-([1-9]|1\d|20)$/.test(id) || id === "hidden-1" || id === "hidden-2")) stageRecords[id as StageId] = parsed;
  }
  const rankAtLeastA = (record: StageRecord | undefined): boolean => record?.bestRank === "A" || record?.bestRank === "S";
  const sRanks = Object.values(stageRecords).filter((record) => record?.bestRank === "S").length;
  const bossCores = Object.values(stageRecords).filter((record) => record?.bossCore).length;
  const noDamageElites = Object.values(stageRecords).reduce((sum, record) => sum + (record?.noDamageEliteWaves ?? 0), 0);
  const allowedFighters = new Set<FighterId>(["falcon"]);
  if (rankAtLeastA(stageRecords["stage-3"])) allowedFighters.add("bulwark");
  if ((stageRecords["stage-4"]?.bestBossTimeSeconds ?? 9999) <= 60) allowedFighters.add("needle");
  if (bossCores >= 6) allowedFighters.add("prism");
  if (noDamageElites >= 3) allowedFighters.add("phantom");
  if (stageRecords["stage-10"]?.cleared) allowedFighters.add("core");
  if (Object.values(stageRecords).some((record) => (record?.maxWeaponsCollected ?? 0) >= 6)) allowedFighters.add("polaris");
  if (sRanks >= 3) allowedFighters.add("eclipse");
  if (stageRecords["stage-15"]?.cleared) allowedFighters.add("titan");
  if (allowedFighters.size >= 9 && stageRecords["hidden-1"]?.cleared) allowedFighters.add("relic");
  const unlockedFighters = requestedUnlockedFighters.filter((id) => allowedFighters.has(id));
  const selectedFighter = unlockedFighters.includes(value.selectedFighter) ? value.selectedFighter : "falcon";
  return {
    version: 1,
    tacticalData: Math.min(999999, Math.floor(value.tacticalData)),
    starCoins: Math.min(999999, Math.floor(value.starCoins)),
    selectedFighter,
    fighterLevels,
    unlockedFighters,
    discoveredWeapons: discoveredWeapons.length > 0 ? discoveredWeapons : ["pulse"],
    stageRecords,
    archiveIds: [...new Set(value.archiveIds.filter((id): id is string => typeof id === "string" && id.length <= 80))].slice(0, 200),
    muted: value.muted === true,
    reducedMotion: value.reducedMotion === true,
  };
};

export class SaveService {
  private data: SaveData;

  public constructor() {
    this.data = this.load();
  }

  public snapshot(): SaveData {
    return structuredClone(this.data);
  }

  public update(mutator: (draft: SaveData) => SaveData): SaveData {
    const next = validateSave(mutator(this.snapshot()));
    if (!next) throw new Error("存档更新未通过校验");
    this.persist(next);
    this.data = next;
    return this.snapshot();
  }

  public reset(): SaveData {
    const next = createDefaultSave();
    this.persist(next);
    this.data = next;
    return this.snapshot();
  }

  private load(): SaveData {
    for (const key of [SAVE_KEY, BACKUP_KEY]) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed: unknown = JSON.parse(raw);
        const valid = validateSave(parsed);
        if (valid) return valid;
      } catch (error: unknown) {
        console.warn("存档读取失败，尝试安全回退", error instanceof Error ? error.message : "未知错误");
      }
    }
    return createDefaultSave();
  }

  private persist(data: SaveData): void {
    try {
      const serialized = JSON.stringify(data);
      const verifiedBackup = JSON.stringify(this.data);
      localStorage.setItem(TEMP_KEY, serialized);
      const staged = localStorage.getItem(TEMP_KEY);
      if (!staged || !validateSave(JSON.parse(staged) as unknown)) throw new Error("临时存档校验失败");
      localStorage.setItem(BACKUP_KEY, verifiedBackup);
      localStorage.setItem(SAVE_KEY, serialized);
      localStorage.removeItem(TEMP_KEY);
    } catch (error: unknown) {
      console.warn("本地存储不可用，当前进度仅保留在内存", error instanceof Error ? error.message : "未知错误");
    }
  }
}
