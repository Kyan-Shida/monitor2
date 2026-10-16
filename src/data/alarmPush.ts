/**
 * @file alarmPush.ts
 * @description 告警推送的「推送人 ↔ 告警」关联口径（告警管理 › 告警推送）：
 *              · 等级：命中任一接收等级即推送，留空 = 全部等级；
 *              · 绑定范围：区域 / 设备两个维度，每个维度留空 = 不限范围，
 *                同一维度多选取并集（OR），维度之间同时成立（AND）。
 *              告警的对象归属与告警 KPI 同源（alarmKpi.deviceOfAlarm → 区域口径），
 *              机器人本体告警没有设备，只取所属区域。
 * @interaction types.ts（AlarmPushStaff / Alarm / State）、alarmKpi.ts（告警 → 设备口径）、
 *              deviceMaster.ts（区域口径）、engine.ts（SAVE_ALARM_PUSH）、
 *              pages/AlarmPush.tsx
 */
import { deviceOfAlarm } from "./alarmKpi";
import { areaNameOf, areaOptions } from "./deviceMaster";
import type { Alarm, AlarmPushStaff, State } from "./types";

/** 绑定范围取值归一化：去空、去重（保存与比对共用同一口径） */
export const normalizeScope = (raw?: string[]): string[] => [
  ...new Set((raw || []).map((x) => String(x).trim()).filter(Boolean)),
];

/** 可选区域：区域主数据 ∪ 设备实际归属（与地图 / 设备下拉同一口径） */
export const areaScopeOptionsOf = (s: State): string[] => areaOptions(s);

/** 可选设备：设备主数据名称（告警经点位的设备名与之对齐） */
export const deviceScopeOptionsOf = (s: State): string[] =>
  (s.devices || []).map((d) => d.name).filter(Boolean);

/** 一条告警的对象归属：区域 / 设备（机器人本体告警没有业务点位，只有区域） */
export interface AlarmScope {
  area: string;
  device: string;
}

/**
 * 反查告警的对象归属
 * @description 设备反查与告警 KPI 同源（`alarmKpi.deviceOfAlarm`）：业务告警取点位所属设备，
 *              区域随设备台账；机器人本体告警没有设备，只取机器人的所属区域
 * @param s 状态
 * @param a 告警事件
 * @returns 对象归属；无该维度信息时为空串（推送匹配里视为「不命中已绑定的范围」）
 */
export function scopeOfAlarm(s: State, a: Alarm): AlarmScope {
  const d = deviceOfAlarm(s, a);
  if (d)
    return {
      area: areaNameOf(s, d),
      device: d.name,
    };
  const r = (s.robots || []).find((x) => x.id === a.robotId);
  return { area: r?.region || "", device: "" };
}

/** 单个维度是否命中：留空（不限）恒命中；指定值时需命中告警的实际归属 */
const hits = (scope: string[] | undefined, actual: string): boolean =>
  !scope?.length || (!!actual && scope.includes(actual));

/**
 * 一条告警应推送给的名单
 * @description 三个条件同时成立：接收等级、区域、设备；
 *              任一维度留空即不限制该维度
 * @param s 状态
 * @param a 告警事件
 * @returns 命中的推送人员（保持名单顺序）
 */
export function pushStaffOfAlarm(s: State, a: Alarm): AlarmPushStaff[] {
  const scope = scopeOfAlarm(s, a);
  return (s.alarmPushStaff || []).filter(
    (p) =>
      (!p.levels.length || p.levels.includes(a.level)) &&
      hits(p.areas, scope.area) &&
      hits(p.devices, scope.device),
  );
}

/**
 * 推送范围摘要（列表列展示）
 * @param p 推送人员
 * @returns 形如「区域 一期罐区 · 设备 V001 原料储罐」；两个维度都留空时返回「全部范围」
 */
export function pushScopeLabel(p: AlarmPushStaff): string {
  const parts = [
    p.areas?.length ? `区域 ${p.areas.join(" / ")}` : "",
    p.devices?.length ? `设备 ${p.devices.join(" / ")}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "全部范围";
}
