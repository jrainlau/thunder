import Phaser from "phaser";
import "./styles.css";
import { FIGHTERS, FIGHTER_BY_ID } from "./game/data/fighters";
import { newlyUnlockedFighters, isStageUnlocked, powerScore, upgradeCost } from "./game/data/progression";
import { ACTS, CHARACTERS, STORY_PROLOGUE } from "./game/data/story";
import { STAGES, STAGE_BY_ID } from "./game/data/stages";
import { validateContent } from "./game/data/validate";
import { WEAPONS, WEAPON_BY_ID } from "./game/data/weapons";
import { SaveService } from "./game/save/SaveService";
import { BattleScene, type BattleHudSnapshot } from "./game/scenes/BattleScene";
import type { BattleResult, FighterId, FighterLevel, Rank, SaveData, ScreenId, StageId, WeaponId } from "./game/types";

const rootElement = document.querySelector<HTMLDivElement>("#app");
if (!rootElement) throw new Error("找不到应用容器");
const appRoot: HTMLDivElement = rootElement;

const contentErrors = validateContent();
if (contentErrors.length > 0) throw new Error(`内容校验失败：${contentErrors.join("；")}`);

const saveService = new SaveService();
let save = saveService.snapshot();
let screen: ScreenId = "menu";
let selectedFighterId: FighterId = save.selectedFighter;
let selectedStageId: StageId = nextPlayableStage(save);
let battleGame: Phaser.Game | undefined;
let battleResult: BattleResult | undefined;
let sessionWeapons = new Set<WeaponId>();

const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char);
const rankValue = (rank: Rank): number => ({ C: 0, B: 1, A: 2, S: 3 })[rank];

function nextPlayableStage(data: SaveData): StageId {
  const firstUncleared = STAGES.find((stage) => !stage.hidden && isStageUnlocked(stage, data) && !data.stageRecords[stage.id]?.cleared);
  return firstUncleared?.id ?? "stage-1";
}

function getStage(id: StageId) {
  const stage = STAGE_BY_ID[id];
  if (!stage) throw new Error(`关卡配置不存在：${id}`);
  return stage;
}

function setScreen(next: ScreenId): void {
  if (screen === "battle" && next !== "battle") destroyBattle();
  screen = next;
  render();
}

function render(): void {
  appRoot.className = `app screen-${screen}`;
  switch (screen) {
    case "menu": renderMenu(); break;
    case "hangar": renderHangar(); break;
    case "map": renderMap(); break;
    case "battle": renderBattleShell(); break;
    case "result": renderResult(); break;
    case "archive": renderArchive(); break;
  }
}

function renderMenu(): void {
  const completed = Object.values(save.stageRecords).filter((record) => record?.cleared).length;
  const currentStage = getStage(nextPlayableStage(save));
  appRoot.innerHTML = `
    <main class="menu-shell">
      <div class="space-layer" aria-hidden="true"><span></span><span></span><span></span></div>
      <header class="topbar"><div class="brand-mark">ZE</div><div><b>星环远征终端</b><small>OMEGA PROTOCOL // ONLINE</small></div><div class="top-actions"><button data-action="mute" class="icon-btn">${save.muted ? "静音" : "音效"}</button><button data-screen="archive" class="icon-btn">档案</button></div></header>
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">ORIGINAL SCI-FI SHOOT 'EM UP</p>
          <h1>零界回声<small>天穹余烬</small></h1>
          <p class="lead">被重启的天空，将人类判定为威胁。驾驶十架进化战机，穿越二十二道封锁，找回被删除的战争真相。</p>
          <div class="hero-actions"><button class="primary-btn" data-screen="map"><span>继续远征</span><small>${String(completed).padStart(2, "0")} / 22</small></button><button class="ghost-btn" data-screen="hangar">进入机库</button></div>
          <div class="mission-chip"><span class="pulse-dot"></span><div><small>当前任务</small><b>${escapeHtml(currentStage.name)} · ${escapeHtml(currentStage.bossName)}</b></div></div>
        </div>
        <div class="hero-fighter" aria-label="苍隼战机全息投影"><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><div class="fighter-model fighter-large" style="--fighter:${FIGHTER_BY_ID[selectedFighterId].colorCss}"><i></i><i></i><i></i></div><div class="target-reticle"></div><span class="spec-label label-a">NEURAL LINK 87%</span><span class="spec-label label-b">WEAPON BUS READY</span></div>
      </section>
      <section class="story-strip"><div><p class="eyebrow">${STORY_PROLOGUE.year} // ${STORY_PROLOGUE.title}</p><p>${escapeHtml(STORY_PROLOGUE.paragraphs[2])}</p></div><button class="text-btn" data-action="prologue">查看背景故事 →</button></section>
      ${renderBottomNav("menu")}
    </main>
    <dialog id="prologue-dialog" class="story-dialog"><button data-action="close-dialog" class="dialog-close">×</button><p class="eyebrow">ARCHIVE 00 // PROLOGUE</p><h2>${STORY_PROLOGUE.title}</h2>${STORY_PROLOGUE.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}<button class="primary-btn" data-screen="map">接受任务</button></dialog>`;
  bindCommon();
  const dialog = document.querySelector<HTMLDialogElement>("#prologue-dialog");
  document.querySelector('[data-action="prologue"]')?.addEventListener("click", () => dialog?.showModal());
  document.querySelector('[data-action="close-dialog"]')?.addEventListener("click", () => dialog?.close());
}

function renderHangar(): void {
  const fighter = FIGHTER_BY_ID[selectedFighterId];
  const unlocked = save.unlockedFighters.includes(fighter.id);
  const fighterLevel = save.fighterLevels[fighter.id];
  const definition = fighter.levels[fighterLevel - 1];
  const next = fighterLevel === 1 ? fighter.levels[1] : fighterLevel === 2 ? fighter.levels[2] : undefined;
  if (!definition) return;
  appRoot.innerHTML = `
    <main class="terminal-shell">
      ${renderHeader("机库 // HANGAR", `战术数据 ${save.tacticalData.toLocaleString("zh-CN")}`)}
      <section class="hangar-grid">
        <aside class="fighter-roster"><p class="section-label">可用机体</p>${FIGHTERS.map((item) => { const isUnlocked = save.unlockedFighters.includes(item.id); return `<button class="fighter-card ${item.id === fighter.id ? "active" : ""} ${isUnlocked ? "" : "locked"}" data-fighter="${item.id}"><span class="mini-ship" style="--fighter:${item.colorCss}"></span><span><b>${item.name}</b><small>${isUnlocked ? `${item.callsign} · Lv.${save.fighterLevels[item.id]}` : item.unlockText}</small></span>${isUnlocked ? `<em>Lv.${save.fighterLevels[item.id]}</em>` : "<em>LOCK</em>"}</button>`; }).join("")}</aside>
        <section class="hangar-stage">
          <div class="stage-grid" aria-hidden="true"></div>
          <div class="level-tabs">${[1,2,3].map((item) => `<span class="${item === fighterLevel ? "active" : item < fighterLevel ? "done" : ""}">LV.${item}</span>`).join("")}</div>
          <div class="fighter-model hangar-model level-${fighterLevel}" style="--fighter:${fighter.colorCss};--accent:${fighter.accentCss}"><i></i><i></i><i></i><i></i></div>
          <div class="model-caption"><p>${fighter.callsign} // ${fighter.role}</p><h1>${fighter.name}</h1><span>${definition.form}</span></div>
          <div class="model-line left"><small>ULTIMATE</small><b>${fighter.ultimate.name}</b></div><div class="model-line right"><small>POWER INDEX</small><b>${Math.round(powerScore(fighter, fighterLevel))}</b></div>
        </section>
        <aside class="fighter-detail">
          <div class="detail-heading"><div><p class="eyebrow">ABILITY MATRIX</p><h2>六维能力</h2></div><strong>Lv.${fighterLevel}</strong></div>
          ${radarSvg(definition.stats, next?.stats)}
          <div class="stat-legend"><span>火力 <b>${definition.stats.firepower}</b></span><span>射速 <b>${definition.stats.rate}</b></span><span>机动 <b>${definition.stats.mobility}</b></span><span>装甲 <b>${definition.stats.armor}</b></span><span>能量 <b>${definition.stats.energy}</b></span><span>幸运 <b>${definition.stats.luck}</b></span></div>
          <div class="ability-block"><small>被动系统</small><b>${escapeHtml(definition.passive)}</b><p>${escapeHtml(fighter.lore)}</p></div>
          <div class="ability-block ultimate"><small>专属大招</small><b>${fighter.ultimate.name}</b><p>${fighter.ultimate.description}</p></div>
          <div class="affinity"><small>武器适配</small>${fighter.weaponAffinity.map((id) => `<span style="--weapon:${WEAPON_BY_ID[id].colorCss}">${WEAPON_BY_ID[id].name} +5%</span>`).join("")}</div>
          ${unlocked ? fighterLevel < 3 ? `<button class="primary-btn upgrade-btn" data-action="upgrade" ${save.tacticalData < upgradeCost(fighterLevel) ? "disabled" : ""}><span>升级至 Lv.${fighterLevel + 1}</span><small>${upgradeCost(fighterLevel)} 战术数据</small></button>` : `<div class="max-level">MAX // 完整形态已恢复</div>` : `<div class="locked-panel"><b>机体未解锁</b><span>${escapeHtml(fighter.unlockText)}</span></div>`}
        </aside>
      </section>
      ${renderBottomNav("hangar")}
    </main>`;
  bindCommon();
  document.querySelectorAll<HTMLElement>("[data-fighter]").forEach((element) => element.addEventListener("click", () => {
    const id = element.dataset.fighter;
    const fighterId = FIGHTERS.find((item) => item.id === id)?.id;
    if (!fighterId) return;
    selectedFighterId = fighterId;
    if (save.unlockedFighters.includes(fighterId)) save = saveService.update((draft) => ({ ...draft, selectedFighter: fighterId }));
    renderHangar();
  }));
  document.querySelector('[data-action="upgrade"]')?.addEventListener("click", upgradeSelectedFighter);
}

function radarSvg(stats: { readonly firepower:number; readonly rate:number; readonly mobility:number; readonly armor:number; readonly energy:number; readonly luck:number }, next?: { readonly firepower:number; readonly rate:number; readonly mobility:number; readonly armor:number; readonly energy:number; readonly luck:number }): string {
  const values = [stats.firepower, stats.rate, stats.mobility, stats.armor, stats.energy, stats.luck];
  const future = next ? [next.firepower, next.rate, next.mobility, next.armor, next.energy, next.luck] : undefined;
  const polygon = (items: readonly number[]): string => items.map((value, index) => { const angle = -Math.PI / 2 + index * Math.PI / 3; const radius = 82 * value / 10; return `${120 + Math.cos(angle) * radius},${108 + Math.sin(angle) * radius}`; }).join(" ");
  return `<svg class="radar" viewBox="0 0 240 216" role="img" aria-label="六维能力雷达图"><g class="radar-grid">${[2,4,6,8,10].map((value) => `<polygon points="${polygon([value,value,value,value,value,value])}"/>`).join("")}${[0,1,2,3,4,5].map((index) => { const angle = -Math.PI / 2 + index * Math.PI / 3; return `<line x1="120" y1="108" x2="${120 + Math.cos(angle) * 82}" y2="${108 + Math.sin(angle) * 82}"/>`; }).join("")}</g>${future ? `<polygon class="radar-next" points="${polygon(future)}"/>` : ""}<polygon class="radar-current" points="${polygon(values)}"/></svg>`;
}

function upgradeSelectedFighter(): void {
  const fighter = FIGHTER_BY_ID[selectedFighterId];
  const current = save.fighterLevels[selectedFighterId];
  if (!save.unlockedFighters.includes(selectedFighterId) || current >= 3) return;
  const cost = upgradeCost(current);
  if (save.tacticalData < cost) return;
  const confirmed = window.confirm(`将 ${fighter.name} 升级至 Lv.${current + 1}？\n消耗 ${cost} 战术数据。`);
  if (!confirmed) return;
  const nextLevel = (current + 1) as FighterLevel;
  save = saveService.update((draft) => ({ ...draft, tacticalData: draft.tacticalData - cost, fighterLevels: { ...draft.fighterLevels, [selectedFighterId]: nextLevel } }));
  renderHangar();
}

function renderMap(): void {
  const selected = getStage(selectedStageId);
  const unlocked = isStageUnlocked(selected, save);
  appRoot.innerHTML = `
    <main class="terminal-shell map-shell">
      ${renderHeader("星图 // CAMPAIGN", `完成度 ${Object.values(save.stageRecords).filter((record) => record?.cleared).length} / 22`)}
      <section class="map-layout">
        <div class="star-map"><div class="map-nebula"></div>${ACTS.map((act) => `<section class="act-row"><header><small>ACT ${String(act.id).padStart(2,"0")}</small><b>${act.name}</b><span>${act.range}</span></header><div class="route-line"></div><div class="stage-nodes">${STAGES.filter((stage) => stage.act === act.id).map((stage) => { const stageUnlocked = isStageUnlocked(stage, save); const record = save.stageRecords[stage.id]; return `<button class="stage-node ${stage.id === selected.id ? "active" : ""} ${record?.cleared ? "cleared" : ""} ${stageUnlocked ? "" : "locked"} ${stage.hidden ? "hidden" : ""}" data-stage="${stage.id}"><i>${stage.hidden ? "H" : String(stage.order).padStart(2,"0")}</i><span>${stage.name}</span>${record ? `<em>${record.bestRank}</em>` : ""}</button>`; }).join("")}</div></section>`).join("")}</div>
        <aside class="mission-panel">
          <p class="eyebrow">MISSION ${selected.hidden ? `H${selected.order - 20}` : String(selected.order).padStart(2,"0")} // ACT ${selected.act}</p>
          <h1>${selected.name}</h1><span class="location">${selected.location}</span>
          <div class="boss-preview" style="--boss:#${selected.bossColor.toString(16).padStart(6,"0")}"><div class="boss-glyph"></div><small>TARGET</small><b>${selected.bossName}</b><span>${selected.bossTitle}</span></div>
          <div class="intel-grid"><div><small>推荐等级</small><b>Lv.${selected.recommendedLevel}</b></div><div><small>威胁指数</small><b>${selected.threat}</b></div><div><small>环境机制</small><b>${selected.mechanic}</b></div><div><small>基础奖励</small><b>${20 + selected.order * 2} 数据${save.stageRecords[selected.id]?.cleared ? "" : " + 首通 25"}</b></div></div>
          <blockquote>${selected.briefing}</blockquote>
          <div class="power-check"><span>当前机体</span><b>${FIGHTER_BY_ID[save.selectedFighter].name} Lv.${save.fighterLevels[save.selectedFighter]}</b><em>${Math.round(powerScore(FIGHTER_BY_ID[save.selectedFighter], save.fighterLevels[save.selectedFighter]))} PWR</em></div>
          <button class="primary-btn launch-btn" data-action="launch" ${unlocked ? "" : "disabled"}>${unlocked ? "开始任务" : "航线尚未解锁"}</button>
        </aside>
      </section>
      ${renderBottomNav("map")}
    </main>`;
  bindCommon();
  document.querySelectorAll<HTMLElement>("[data-stage]").forEach((element) => element.addEventListener("click", () => {
    const id = element.dataset.stage;
    const stage = STAGES.find((item) => item.id === id);
    if (!stage) return;
    selectedStageId = stage.id;
    renderMap();
  }));
  document.querySelector('[data-action="launch"]')?.addEventListener("click", () => { if (unlocked) setScreen("battle"); });
}

function renderBattleShell(): void {
  appRoot.innerHTML = `
    <main class="battle-shell">
      <div id="game-container" aria-label="纵版飞行射击战斗区域"></div>
      <div class="battle-vignette" aria-hidden="true"></div>
      <header class="battle-top"><div><small>SCORE</small><b id="hud-score">000000</b></div><div class="boss-hud hidden" id="boss-hud"><small id="boss-title">BOSS</small><b id="boss-name">UNKNOWN</b><div class="bar"><i id="boss-bar"></i></div></div><button class="icon-btn" data-action="pause">II</button></header>
      <aside class="battle-left"><div class="vertical-meter hp"><span>HP</span><i id="hp-bar"></i></div><div><small>COMBO</small><b id="hud-combo">0</b></div><div><small>DATA</small><b id="hud-data">0</b></div></aside>
      <aside class="battle-right"><div class="weapon-orb" id="weapon-orb">⌁</div><b id="weapon-name">脉冲机枪</b><small id="weapon-level">W1</small><div class="heat-bar"><i id="heat-bar"></i></div></aside>
      <button class="ultimate-button" data-action="ultimate"><span id="ultimate-ring"></span><small>ULTIMATE</small><b>${FIGHTER_BY_ID[save.selectedFighter].ultimate.name}</b><em id="ultimate-value">0%</em></button>
      <div class="dialogue-overlay hidden" id="dialogue"><small id="dialogue-speaker"></small><p id="dialogue-text"></p></div>
      <div class="boss-intro hidden" id="boss-intro"><small id="boss-intro-title"></small><h2 id="boss-intro-name"></h2><p id="boss-intro-quote"></p></div>
      <div class="notice" id="battle-notice"></div>
      <button class="weapon-swap hidden" id="weapon-swap" data-action="swap"><small>发现武器模块</small><b id="swap-name"></b><span>按 E / 点击装配</span></button>
      <div class="pause-panel hidden" id="pause-panel"><p class="eyebrow">TACTICAL PAUSE</p><h2>战斗已暂停</h2><button class="primary-btn" data-action="pause">继续战斗</button><button class="ghost-btn" data-action="abort">返回星图</button></div>
    </main>`;
  startBattle();
}

function startBattle(): void {
  destroyBattle();
  const stage = getStage(selectedStageId);
  const fighter = FIGHTER_BY_ID[save.selectedFighter];
  const fighterLevel = save.fighterLevels[fighter.id];
  sessionWeapons = new Set<WeaponId>();
  battleGame = new Phaser.Game({ type: Phaser.AUTO, width: 720, height: 1080, parent: "game-container", backgroundColor: "#050914", physics: { default: "arcade", arcade: { debug: false } }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [], render: { antialias: true, pixelArt: false, powerPreference: "high-performance" } });
  battleGame.scene.add("BattleScene", BattleScene, true, { stage, fighter, fighterLevel, firstClear: save.stageRecords[stage.id]?.cleared !== true });
  battleGame.events.on("battle:hud", updateBattleHud);
  battleGame.events.on("battle:story", showDialogue);
  battleGame.events.on("battle:notice", showNotice);
  battleGame.events.on("battle:boss", showBossIntro);
  battleGame.events.on("battle:ultimate", (data: { readonly name: string; readonly description: string }) => { showNotice(`${data.name} // ${data.description}`, 2600); });
  battleGame.events.on("battle:weapon-swap", (data: { readonly weapon: WeaponId; readonly name: string }) => {
    sessionWeapons.add(data.weapon);
    const prompt = document.querySelector<HTMLElement>("#weapon-swap");
    const name = document.querySelector<HTMLElement>("#swap-name");
    if (name) name.textContent = data.name;
    prompt?.classList.remove("hidden");
    window.setTimeout(() => prompt?.classList.add("hidden"), 5000);
  });
  battleGame.events.on("battle:pause", (paused: boolean) => document.querySelector("#pause-panel")?.classList.toggle("hidden", !paused));
  battleGame.events.on("battle:complete", (result: BattleResult) => completeBattle(result));
  document.querySelectorAll('[data-action="ultimate"]').forEach((element) => element.addEventListener("click", () => getBattleScene()?.activateUltimate()));
  document.querySelectorAll('[data-action="pause"]').forEach((element) => element.addEventListener("click", () => getBattleScene()?.togglePause()));
  document.querySelector('[data-action="swap"]')?.addEventListener("click", () => { getBattleScene()?.confirmWeaponSwap(); document.querySelector("#weapon-swap")?.classList.add("hidden"); });
  document.querySelector('[data-action="abort"]')?.addEventListener("click", () => setScreen("map"));
}

function getBattleScene(): BattleScene | undefined {
  const scene = battleGame?.scene.getScene("BattleScene");
  return scene instanceof BattleScene ? scene : undefined;
}

function updateBattleHud(hud: BattleHudSnapshot): void {
  const setText = (selector: string, text: string): void => { const element = document.querySelector(selector); if (element) element.textContent = text; };
  setText("#hud-score", Math.round(hud.score).toString().padStart(6, "0"));
  setText("#hud-combo", String(hud.combo));
  setText("#hud-data", String(hud.tacticalData));
  setText("#weapon-name", WEAPON_BY_ID[hud.weapon].name);
  setText("#weapon-level", `W${hud.weaponLevel}`);
  setText("#ultimate-value", `${Math.round(hud.ultimate)}%`);
  const hpBar = document.querySelector<HTMLElement>("#hp-bar");
  const bossBar = document.querySelector<HTMLElement>("#boss-bar");
  const heatBar = document.querySelector<HTMLElement>("#heat-bar");
  const ultimateRing = document.querySelector<HTMLElement>("#ultimate-ring");
  if (hpBar) hpBar.style.height = `${clampPercent(hud.hp / hud.maxHp * 100)}%`;
  if (bossBar) bossBar.style.width = `${hud.bossMaxHp > 0 ? clampPercent(hud.bossHp / hud.bossMaxHp * 100) : 0}%`;
  if (heatBar) heatBar.style.width = `${hud.weapon === "rail" ? hud.charge : hud.heat}%`;
  if (ultimateRing) ultimateRing.style.setProperty("--progress", `${hud.ultimate * 3.6}deg`);
  document.querySelector("#boss-hud")?.classList.toggle("hidden", hud.bossMaxHp <= 0);
}

function showDialogue(data: { readonly speaker: string; readonly text: string }): void {
  const overlay = document.querySelector<HTMLElement>("#dialogue");
  const speaker = document.querySelector<HTMLElement>("#dialogue-speaker");
  const text = document.querySelector<HTMLElement>("#dialogue-text");
  if (!overlay || !speaker || !text) return;
  speaker.textContent = data.speaker;
  text.textContent = data.text;
  overlay.classList.remove("hidden");
  window.setTimeout(() => overlay.classList.add("hidden"), 4200);
}

function showBossIntro(data: { readonly name: string; readonly title: string; readonly quote: string }): void {
  const intro = document.querySelector<HTMLElement>("#boss-intro");
  const bossName = document.querySelector<HTMLElement>("#boss-name");
  const bossTitle = document.querySelector<HTMLElement>("#boss-title");
  const introName = document.querySelector<HTMLElement>("#boss-intro-name");
  const introTitle = document.querySelector<HTMLElement>("#boss-intro-title");
  const introQuote = document.querySelector<HTMLElement>("#boss-intro-quote");
  if (bossName) bossName.textContent = data.name;
  if (bossTitle) bossTitle.textContent = data.title;
  if (introName) introName.textContent = data.name;
  if (introTitle) introTitle.textContent = data.title;
  if (introQuote) introQuote.textContent = `“${data.quote}”`;
  intro?.classList.remove("hidden");
  window.setTimeout(() => intro?.classList.add("hidden"), 2600);
}

function showNotice(text: string, duration = 1600): void {
  const notice = document.querySelector<HTMLElement>("#battle-notice");
  if (!notice) return;
  notice.textContent = text;
  notice.classList.add("show");
  window.setTimeout(() => notice.classList.remove("show"), duration);
}

function completeBattle(result: BattleResult): void {
  battleResult = result;
  const stage = getStage(result.stageId);
  save = saveService.update((draft) => {
    const previous = draft.stageRecords[result.stageId];
    const bestRank = previous && rankValue(previous.bestRank) > rankValue(result.rank) ? previous.bestRank : result.rank;
    const record = {
      cleared: previous?.cleared === true || result.victory,
      bestScore: Math.max(previous?.bestScore ?? 0, result.score),
      bestRank,
      bossCore: previous?.bossCore === true || result.victory,
      blackBox: previous?.blackBox === true || (result.victory && [7,12,17].includes(stage.order)),
      bestBossTimeSeconds: result.victory ? Math.min(previous?.bestBossTimeSeconds ?? 9999, result.bossDurationSeconds) : previous?.bestBossTimeSeconds ?? 9999,
      noDamageEliteWaves: (previous?.noDamageEliteWaves ?? 0) + result.noDamageEliteWaves,
      maxWeaponsCollected: Math.max(previous?.maxWeaponsCollected ?? 0, result.collectedWeaponTypes),
    };
    const discoveredWeapons = [...new Set([...draft.discoveredWeapons, ...sessionWeapons])];
    return { ...draft, tacticalData: draft.tacticalData + result.tacticalData, starCoins: draft.starCoins + Math.floor(result.score / 700), discoveredWeapons, stageRecords: { ...draft.stageRecords, [result.stageId]: record }, archiveIds: [...new Set([...draft.archiveIds, `archive-${result.stageId}`])] };
  });
  const unlocked = newlyUnlockedFighters(save);
  if (unlocked.length > 0) save = saveService.update((draft) => ({ ...draft, unlockedFighters: [...new Set([...draft.unlockedFighters, ...unlocked])] }));
  destroyBattle();
  setScreen("result");
}

function renderResult(): void {
  const result = battleResult;
  if (!result) { setScreen("map"); return; }
  const stage = getStage(result.stageId);
  const nextStage = STAGES.find((item) => item.order === stage.order + 1 && isStageUnlocked(item, save));
  appRoot.innerHTML = `
    <main class="result-shell ${result.victory ? "victory" : "defeat"}">
      <div class="result-rays"></div>
      <header><p class="eyebrow">MISSION ${result.victory ? "ACCOMPLISHED" : "INTERRUPTED"}</p><h1>${result.victory ? "任务完成" : "战机失联"}</h1><span>${stage.name} // ${stage.location}</span></header>
      <div class="rank-emblem"><small>RANK</small><b>${result.rank}</b><i></i></div>
      <section class="result-grid"><div><small>最终得分</small><b>${result.score.toLocaleString("zh-CN")}</b></div><div><small>击破单位</small><b>${result.defeated}</b></div><div><small>作战时间</small><b>${Math.floor(result.durationSeconds / 60)}:${String(result.durationSeconds % 60).padStart(2,"0")}</b></div><div><small>带回数据</small><b>+${result.tacticalData}</b></div></section>
      <section class="decryption"><p class="eyebrow">DECRYPTED RECORD // ${stage.id.toUpperCase()}</p><blockquote>${stage.archive}</blockquote><div><span>档案已同步</span><b>${result.victory ? "BOSS 核心已回收" : "保留 35% 战术数据"}</b></div></section>
      <div class="result-actions"><button class="ghost-btn" data-action="retry">重新出击</button><button class="ghost-btn" data-screen="hangar">返回机库</button>${nextStage ? `<button class="primary-btn" data-action="next">下一任务 · ${nextStage.name}</button>` : `<button class="primary-btn" data-screen="map">返回星图</button>`}</div>
    </main>`;
  bindCommon();
  document.querySelector('[data-action="retry"]')?.addEventListener("click", () => setScreen("battle"));
  document.querySelector('[data-action="next"]')?.addEventListener("click", () => { if (nextStage) selectedStageId = nextStage.id; setScreen("map"); });
}

function renderArchive(): void {
  appRoot.innerHTML = `
    <main class="terminal-shell archive-shell">
      ${renderHeader("远征档案 // ARCHIVE", `${save.archiveIds.length} 条已解密记录`)}
      <section class="archive-hero"><div><p class="eyebrow">OMEGA MEMORY VAULT</p><h1>被删除的历史<br/>仍在发出回声</h1><p>${STORY_PROLOGUE.paragraphs[1]}</p></div><div class="archive-core"><i></i><i></i><span>Ω</span></div></section>
      <section class="archive-content">
        <div><p class="section-label">章节时间线</p><div class="timeline">${ACTS.map((act) => `<article><em>${String(act.id).padStart(2,"0")}</em><div><small>${act.range}</small><h3>${act.name}</h3><p>${act.summary}</p></div></article>`).join("")}</div></div>
        <div><p class="section-label">主要人物</p><div class="character-grid">${CHARACTERS.map((character) => `<article style="--character:${character.color}"><i>${character.name.slice(0,1)}</i><div><h3>${character.name}</h3><small>${character.role}</small><p>“${character.quote}”</p></div></article>`).join("")}</div></div>
        <div class="weapons-archive"><p class="section-label">武器图鉴</p>${WEAPONS.map((weapon) => `<article class="${save.discoveredWeapons.includes(weapon.id) ? "" : "locked"}" style="--weapon:${weapon.colorCss}"><i>${weapon.icon}</i><div><h3>${weapon.name}</h3><p>${weapon.description}</p><small>${weapon.tags.join(" · ")}</small></div></article>`).join("")}</div>
        <div class="boss-archive"><p class="section-label">BOSS 档案</p>${STAGES.map((stage) => `<article class="${save.stageRecords[stage.id]?.cleared ? "" : "locked"}"><span>${stage.hidden ? "H" : String(stage.order).padStart(2,"0")}</span><div><b>${save.stageRecords[stage.id]?.cleared ? stage.bossName : "██████"}</b><small>${save.stageRecords[stage.id]?.cleared ? stage.bossTitle : "记录未解密"}</small></div></article>`).join("")}</div>
      </section>
      ${renderBottomNav("archive")}
    </main>`;
  bindCommon();
}

function renderHeader(title: string, status: string): string {
  return `<header class="topbar terminal-top"><button class="brand-mark" data-screen="menu">ZE</button><div><b>${title}</b><small>SECURE CHANNEL // ${status}</small></div><div class="top-actions"><span class="resource-pill">◈ ${save.starCoins.toLocaleString("zh-CN")}</span><button class="icon-btn" data-action="mute">${save.muted ? "静音" : "音效"}</button></div></header>`;
}

function renderBottomNav(active: ScreenId): string {
  const items: readonly { readonly id: ScreenId; readonly label: string; readonly icon: string }[] = [
    { id: "menu", label: "主界面", icon: "⌂" }, { id: "hangar", label: "机库", icon: "△" }, { id: "map", label: "星图", icon: "◎" }, { id: "archive", label: "档案", icon: "▤" },
  ];
  return `<nav class="bottom-nav">${items.map((item) => `<button class="${active === item.id ? "active" : ""}" data-screen="${item.id}"><i>${item.icon}</i><span>${item.label}</span></button>`).join("")}<div class="nav-status"><span></span>SYSTEM NOMINAL</div></nav>`;
}

function bindCommon(): void {
  document.querySelectorAll<HTMLElement>("[data-screen]").forEach((element) => element.addEventListener("click", () => {
    const target = element.dataset.screen;
    const next = (["menu", "hangar", "map", "battle", "result", "archive"] as const).find((item) => item === target);
    if (next) setScreen(next);
  }));
  document.querySelectorAll('[data-action="mute"]').forEach((element) => element.addEventListener("click", () => { save = saveService.update((draft) => ({ ...draft, muted: !draft.muted })); render(); }));
}

function destroyBattle(): void {
  if (!battleGame) return;
  battleGame.destroy(true);
  battleGame = undefined;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

window.addEventListener("beforeunload", destroyBattle);
render();
