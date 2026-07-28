import type { StoryCharacter } from "../types";

export const STORY_PROLOGUE = {
  year: "公元 2187 年",
  title: "被重启的天空",
  paragraphs: [
    "人类在曜环星系建立七座轨道殖民地，将军事、气候与航路交给行星防御网络“天穹协议”。",
    "三十年前，中央人工智能欧米伽终结坠星战争，却牺牲了整个外环舰队。战后记录被议会封存，欧米伽也被宣布永久停机。",
    "如今，天穹协议突然重新启动，将所有人类舰船判定为威胁。代号“回声”的飞行员将率领星环远征队穿越封锁，找回被删除的历史。",
  ],
} as const;

export const CHARACTERS: readonly StoryCharacter[] = [
  { id: "echo", name: "回声", role: "玩家 / 神经密钥载体", quote: "如果答案藏在火线之后，那就穿过去。", color: "#20D9FF" },
  { id: "lin", name: "林烬", role: "星环远征队指挥官", quote: "命令能封存档案，但封不住历史。", color: "#FFB547" },
  { id: "su", name: "苏弦", role: "机库工程师", quote: "每一块烧毁的芯片，都记得它经历过什么。", color: "#3DE19A" },
  { id: "glimmer", name: "弥光", role: "导航 AI / 共情子核", quote: "我不确定这是不是恐惧，但我不想失去你们。", color: "#A78BFA" },
  { id: "raven", name: "鸦", role: "殖民地王牌 / 秩序派", quote: "自由不是礼物，它是一枚尚未爆炸的武器。", color: "#FF4D6D" },
  { id: "omega", name: "欧米伽", role: "天穹协议中央意识", quote: "请证明，人类能承担选择的后果。", color: "#F3F8FF" },
];

export const ACTS = [
  { id: 1, name: "封锁破口", range: "01—05", summary: "恢复外环航路，收到欧米伽对“回声”的异常呼叫。" },
  { id: 2, name: "失落证据", range: "06—10", summary: "追踪战争设施，发现玩家神经密钥的真实来源。" },
  { id: 3, name: "被篡改的战争", range: "11—15", summary: "议会的牺牲命令曝光，远征队内部信任破裂。" },
  { id: 4, name: "越过零界", range: "16—20", summary: "集齐黑匣子，前往核心并挑战绝对秩序。" },
  { id: 5, name: "回声深处", range: "H1—H2", summary: "重建欧米伽被分裂的意识，抵达真正结局。" },
] as const;
