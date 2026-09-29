import type { State } from "./types";
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
  version: number;
}
export function rulesOf(s: State): AlarmRule[] {
  return s.points.map(
    (p) =>
      s.alarmRules?.find((r) => r.pointId === p.id) || {
        id: "RULE-" + p.id,
        name: p.name + "标准",
        pointId: p.id,
        type: p.kind === "阀门" ? "期望状态" : "数值范围",
        unit: p.unit,
        min: p.kind === "仪表" ? 0.2 : 0,
        max: p.kind === "红外" ? 60 : 0.8,
        expected: "开启",
        level: "重要",
        enabled: ["P001", "P002", "P003"].includes(p.id),
        version: 1,
      },
  );
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
