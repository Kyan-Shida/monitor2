/**
 * @file alarmKpi.ts
 * @description 告警记录 KPI 的两个划分维度：区域 / 设备。
 *              口径与「分析与报表 › 指标中心」完全一致（报警准确率 = 已处理中非误报占比；
 *              告警处理率 = 已处理 / 总数），维度值从告警所属巡检点的设备上取：
 *              区域走 `areaNameOf`（区域主数据 / 安装位置前缀）。
 * @interaction metrics.ts（口径来源）、deviceMaster.ts（区域的唯一口径）、
 *              pages/Results.tsx（告警记录 › KPI 维度明细表）
 */
import { areaNameOf } from "./deviceMaster";
import type { Alarm, DeviceAsset, State } from "./types";

/** 告警 KPI 可切换的划分维度 */
export const ALARM_KPI_DIMS = ["区域", "设备"] as const;
export type AlarmKpiDim = (typeof ALARM_KPI_DIMS)[number];

/** 一个维度值上的一行 KPI */
export interface AlarmKpiRow {
  /** 维度值（区域名称 / 设备名称） */
  key: string;
  /** 告警总数 */
  total: number;
  /** 未处理（无处理时间） */
  open: number;
  /** 报警准确率（%）：已处理告警中非误报占比 */
  accuracy: number;
  /** 告警处理率（%）：已处理告警 / 告警总数 */
  rate: number;
}

/** 百分比，保留一位小数；分母为 0 时返回 0（与指标中心 pct 同口径） */
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * 告警的所属设备
 * @param s 状态
 * @param a 告警事件
 * @returns 设备主数据；机器人本体告警（无业务点位）或设备已删除时为空
 */
export function deviceOfAlarm(s: State, a: Alarm): DeviceAsset | undefined {
  const name = s.points.find((p) => p.id === a.pointId)?.device;
  return name ? s.devices?.find((d) => d.name === name) : undefined;
}

/**
 * 告警在指定维度上的取值
 * @param s 状态
 * @param a 告警事件
 * @param dim 维度
 * @returns 维度值；无设备时按维度给「机器人本体 / 未标注设备」
 */
export function dimValueOfAlarm(s: State, a: Alarm, dim: AlarmKpiDim): string {
  const d = deviceOfAlarm(s, a);
  if (dim === "设备") return d?.name || "机器人本体";
  if (!d) return "未标注设备";
  return areaNameOf(s, d) || "未指定";
}

/**
 * 按维度汇总告警 KPI
 * @param s 状态
 * @param dim 划分维度
 * @param alarms 统计范围；缺省 = 顶部总览卡同一范围（有任务的告警），保证明细行合计与总览一致
 * @returns 按告警总数倒序排列的 KPI 行
 */
export function alarmKpiRows(
  s: State,
  dim: AlarmKpiDim,
  alarms?: Alarm[],
): AlarmKpiRow[] {
  const base = alarms || s.alarms.filter((a) => a.taskId);
  const groups = new Map<string, Alarm[]>();
  for (const a of base) {
    const key = dimValueOfAlarm(s, a, dim);
    const list = groups.get(key);
    if (list) list.push(a);
    else groups.set(key, [a]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const handled = list.filter((a) => a.handledAt);
      return {
        key,
        total: list.length,
        open: list.filter((a) => !a.handledAt).length,
        accuracy: pct(
          handled.filter((a) => a.falsePositive === false).length,
          handled.length,
        ),
        rate: pct(handled.length, list.length),
      };
    })
    .sort((x, y) => y.total - x.total);
}
