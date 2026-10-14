/**
 * @file businessTargetCrumb.ts
 * @description 巡检目标台账的**归属链一句话**（区域 › 设备 › 仪表 · 巡检要求）：
 *              巡检点编辑页（候选台账列表 / 右栏详情）与巡检项编辑页共用同一表达，
 *              避免两个页面各写一套标签口径。
 * @interaction pages/PointEdit.tsx、pages/InspectItemEdit.tsx
 */
import type { State } from "./types";

/**
 * 业务目标一句话归属
 * @param s 全局状态
 * @param bid 巡检目标台账 id
 * @returns 「区域 › 设备 › 仪表 · 巡检要求」；缺项以 — 占位
 */
export function businessTargetLabelOf(s: State, bid: string): string {
  const b = (s.businessTargets || []).find((x) => x.id === bid);
  const ins = (s.instruments || []).find((x) => x.id === b?.instrumentId);
  const dev = (s.devices || []).find((d) => d.id === ins?.deviceId);
  const req = (s.requirements || []).find((r) => r.id === b?.requirementId);
  return `${dev?.region || "—"} › ${dev?.name || "—"} › ${ins?.name || "—"} · ${req?.name || ""}`;
}
