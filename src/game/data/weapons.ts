import type { WeaponDefinition, WeaponId } from "../types";

export const WEAPONS: readonly WeaponDefinition[] = [
  { id: "pulse", name: "脉冲机枪", icon: "⌁", description: "稳定连射，精准维持连击。", tags: ["点射", "连射", "直射"], baseDamage: 13, fireIntervalMs: 115, color: 0x20d9ff, colorCss: "#20D9FF" },
  { id: "laser", name: "棱镜激光", icon: "┃", description: "持续穿透纵列目标，注意热量。", tags: ["持续", "穿透", "热量"], baseDamage: 7, fireIntervalMs: 65, color: 0x7b61ff, colorCss: "#7B61FF" },
  { id: "drone", name: "浮游炮群", icon: "✣", description: "侧翼浮游单元自动索敌。", tags: ["索敌", "侧翼", "范围"], baseDamage: 10, fireIntervalMs: 185, color: 0x3de19a, colorCss: "#3DE19A" },
  { id: "scatter", name: "炽流霰炮", icon: "⋰", description: "近距扇形高爆发，远距衰减。", tags: ["扇形", "近距", "爆发"], baseDamage: 10, fireIntervalMs: 245, color: 0xffb547, colorCss: "#FFB547" },
  { id: "missile", name: "蜂群导弹", icon: "⌁", description: "低频多锁，追踪高机动目标。", tags: ["低频", "多目标", "追踪"], baseDamage: 25, fireIntervalMs: 430, color: 0xff4d6d, colorCss: "#FF4D6D" },
  { id: "rail", name: "轨道蓄能炮", icon: "◆", description: "贯穿破甲的蓄力点射。", tags: ["蓄力", "贯穿", "破甲"], baseDamage: 58, fireIntervalMs: 760, color: 0xf3f8ff, colorCss: "#F3F8FF" },
];

export const WEAPON_BY_ID: Readonly<Record<WeaponId, WeaponDefinition>> = Object.fromEntries(
  WEAPONS.map((weapon) => [weapon.id, weapon]),
) as Readonly<Record<WeaponId, WeaponDefinition>>;
