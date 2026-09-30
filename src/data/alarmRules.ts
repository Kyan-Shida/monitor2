import type { Point, State } from "./types";
export interface AlarmRule {
  id: string;
  name: string;
  pointId: string;
  type: "数值范围" | "期望状态";
  unit: string;
  min: number;
  max: number;
  expected: string;
  level: string;
  enabled: boolean;
  /** 通知对象（来自巡检目标台账的告警设置），随告警记录带出 */
  notify?: string[];
  version: number;
}
/**
 * 默认判定阈值：按**单位**给量程，而不是按业务类型（`Point.kind`）
 * @description J′ 口径收敛的一部分：业务类型（仪表 / 阀门）只用于展示与设备主数据关联，
 *              判定标准必须由"检测项 + 单位"决定（如 压力 MPa 量程 0.2–0.8、温度 ℃ 上限 60、气体 %LEL 上限 20）
 */
const DEFAULT_RANGE: Record<string, { min: number; max: number }> = {
  MPa: { min: 0.2, max: 0.8 },
  "℃": { min: 0, max: 60 },
  "%LEL": { min: 0, max: 20 },
  m: { min: 0, max: 5 },
};

/**
 * 按单位取默认量程
 * @description 唯一口径：点位判定规则与巡检目标台账的默认阈值都调用它，避免两处量程不一致
 * @param unit 单位（MPa / ℃ / %LEL / m …）
 * @returns 量程；无单位（无量纲项）返回 undefined
 */
export const defaultRangeOfUnit = (unit?: string) =>
  unit ? DEFAULT_RANGE[unit] || { min: 0, max: 1 } : undefined;

/**
 * 巡检点绑定的巡检目标台账（取其第一个巡检项所绑的）
 * @param s 全局状态
 * @param p 巡检点
 * @returns 巡检目标台账；无巡检项或目标已被删除时返回 undefined
 */
export const targetOfPoint = (s: State, p: Point) =>
  (p.inspectItems || [])
    .map((sp) => s.businessTargets?.find((b) => b.id === sp.targetId))
    .find(Boolean);

/**
 * 各点位的判定规则
 * @description **默认来源 = 该巡检点绑定的巡检目标台账**：判定方式 / 阈值 / 告警等级 /
 *              是否告警全部取自「巡检目标台账 › 配业务逻辑与算法」，这是平台唯一的告警配置入口
 *              （巡检点、点位都不再提供告警配置）。
 *              已存规则（`s.alarmRules`，历史版本）优先于业务目标，保证"规则版本 + 结果快照"语义；
 *              两者都没有时按"检测项单位"生成兜底规则
 * @param s 全局状态
 * @returns 与 `s.points` 一一对应的规则列表
 */
export function rulesOf(s: State): AlarmRule[] {
  return s.points.map((p) => {
    const stored = s.alarmRules?.find((r) => r.pointId === p.id);
    if (stored) return stored;
    const bt = targetOfPoint(s, p);
    if (bt) {
      const range = bt.judge === "数值范围";
      return {
        id: "RULE-" + p.id,
        name: (bt.goal || p.name) + " 标准",
        pointId: p.id,
        type: range ? "数值范围" : "期望状态",
        unit: bt.unit || p.unit,
        min: range ? (bt.min ?? 0) : 0,
        max: range ? (bt.max ?? 0) : 0,
        expected: bt.expected || "开启",
        level: bt.alarm?.level || "重要",
        // 「是否巡检」与「告警开关」都为真才判定；否则只记录结果与证据，不生成告警
        enabled: bt.inspect !== false && bt.alarm?.on !== false,
        notify: bt.alarm?.notify,
        version: 1,
      };
    }
    // 无单位 = 无量纲项（阀位 / 状态类），按"期望状态"判定；有单位按量程判定
    const range = defaultRangeOfUnit(p.unit);
    return {
      id: "RULE-" + p.id,
      name: p.name + "标准",
      pointId: p.id,
      type: range ? "数值范围" : "期望状态",
      unit: p.unit,
      min: range?.min ?? 0,
      max: range?.max ?? 0,
      expected: "开启",
      level: "重要",
      enabled: ["P001", "P002", "P003"].includes(p.id),
      version: 1,
    };
  });
}
export function evaluateRule(rule: AlarmRule | undefined, value: string) {
  if (!rule || !rule.enabled)
    return {
      abnormal: false,
      reason: "规则未配置或停用，需人工复核",
      valid: false,
    };
  if (!value.trim())
    return {
      abnormal: false,
      reason: "识别结果为空，需人工复核",
      valid: false,
    };
  if (
    rule.type === "数值范围" &&
    (!value.trim() || !Number.isFinite(Number(value)))
  )
    return { abnormal: false, reason: "无有效数值，需人工复核", valid: false };
  const abnormal =
    rule.type === "期望状态"
      ? value !== rule.expected
      : Number(value) < rule.min || Number(value) > rule.max;
  return {
    abnormal,
    valid: true,
    reason:
      rule.type === "期望状态"
        ? `期望 ${rule.expected}；实测 ${value}`
        : `正常范围 ${rule.min}–${rule.max} ${rule.unit}；实测 ${value}`,
  };
}

export interface SystemRules {
  heartbeatSeconds: number;
  dispatchSeconds: number;
  lowBattery: number;
  version: number;
}
export const systemRulesOf = (s: State): SystemRules =>
  s.systemRules || {
    heartbeatSeconds: 30,
    dispatchSeconds: 15,
    lowBattery: 20,
    version: 1,
  };
