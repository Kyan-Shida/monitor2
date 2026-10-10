import { kindOfTarget, kindOfUnit, templateFor } from "./alarmTemplates";
import type { AlarmLevel, Point, State } from "./types";
export interface AlarmRule {
  id: string;
  name: string;
  pointId: string;
  type: "数值范围" | "期望状态";
  unit: string;
  min: number;
  max: number;
  expected: string;
  /** 风险等级：一级 / 二级 / 三级 */
  level: AlarmLevel;
  enabled: boolean;
  /** 通知对象（来自巡检目标台账的告警设置），随告警记录带出 */
  notify?: string[];
  /**
   * 引用的告警模板（后台管理 › 告警模板管理）：
   * 触发逻辑与处理流程都取自模板，模板改了规则同步生效；随结果快照带出，供处置页展示处理流程
   */
  templateId?: string;
  /** 触发逻辑：单次即触发 / 连续确认（连续 N 次超限才触发，抑制抖动误报） */
  triggerMode?: "单次即触发" | "连续确认";
  /** 连续确认次数：triggerMode = 连续确认 时生效（至少 2） */
  consecutive?: number;
  /** 声光报警持续时长（秒）：模板来源取模板值，手动来源取台账手填值；0 = 不启动 */
  alarmSeconds?: number;
  /** 处置流程步骤：模板来源取模板流程，手动来源取台账手填流程（受理后按此逐条复检） */
  flow?: string[];
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
      /**
       * 告警规则来源（台账「3、告警规则」的两种选择）：
       * · 模板（source = 模板）：触发条件 / 触发逻辑 / 等级 / 声光报警 / 处置流程全由模板下发；
       *   未指定具体模板时按检测类型自动套用启用模板；模板被停用 / 删除时回落手动口径，不会突然"没有判定口径"
       * · 手动（source = 手动，含老数据）：用台账自己的判定方式 / 阈值 / 期望状态 + 手填的触发逻辑等
       */
      const useTpl =
        bt.alarm?.source === "模板" ||
        (bt.alarm?.source === undefined && !!bt.alarm?.templateId);
      // 检测类型：优先巡检要求的显式声明（环境 / 区域类没有量纲），否则按单位换算
      const tpl = useTpl
        ? templateFor(
            s,
            kindOfTarget(s, bt.requirementId, bt.unit || p.unit),
            bt.unit || p.unit,
            bt.alarm?.templateId,
          )
        : undefined;
      return {
        id: "RULE-" + p.id,
        name: (bt.goal || p.name) + " 标准",
        pointId: p.id,
        type: tpl ? tpl.trigger.type : range ? "数值范围" : "期望状态",
        unit: tpl ? tpl.trigger.unit || bt.unit || p.unit : bt.unit || p.unit,
        min: tpl ? tpl.trigger.min : range ? (bt.min ?? 0) : 0,
        max: tpl ? tpl.trigger.max : range ? (bt.max ?? 0) : 0,
        expected: tpl ? tpl.trigger.expected || "开启" : bt.expected || "开启",
        // 等级：台账显式设置优先（关联模板时已自动带出模板默认等级），无设置才用模板默认
        level: bt.alarm?.level || tpl?.level || "二级",
        // 平台没有「告警开关」：判定异常即告警；唯一的开关是台账的「是否巡检」
        enabled: bt.inspect !== false,
        notify: bt.alarm?.notify,
        templateId: tpl?.id,
        triggerMode: tpl
          ? tpl.trigger.mode
          : bt.alarm?.triggerMode || "单次即触发",
        consecutive: tpl
          ? tpl.trigger.consecutive
          : bt.alarm?.consecutive || 1,
        alarmSeconds: tpl ? tpl.alarmSeconds : (bt.alarm?.alarmSeconds ?? 0),
        flow: tpl?.flow || bt.alarm?.flow || [],
        version: 1,
      };
    }
    /**
     * 兜底分支：点位没有绑巡检目标台账时，按检测类型匹配后台管理的**启用模板**，
     * 触发条件（量程 / 期望状态）与告警等级都取自模板；无命中模板才回落按单位量程。
     */
    const tpl = templateFor(s, kindOfUnit(p.unit), p.unit);
    // 无单位 = 无量纲项（阀位 / 状态类），按"期望状态"判定；有单位按量程判定
    const range = defaultRangeOfUnit(tpl ? tpl.trigger.unit : p.unit);
    return {
      id: "RULE-" + p.id,
      name: p.name + "标准",
      pointId: p.id,
      type: tpl ? tpl.trigger.type : range ? "数值范围" : "期望状态",
      unit: tpl ? tpl.trigger.unit || p.unit : p.unit,
      min: tpl ? tpl.trigger.min : (range?.min ?? 0),
      max: tpl ? tpl.trigger.max : (range?.max ?? 0),
      expected: tpl?.trigger.expected || "开启",
      level: tpl?.level || "二级",
      // 模板停用 = 该检测类型不再自动套用，退回"未配置告警"（只记录结果）
      enabled: ["P001", "P002", "P003"].includes(p.id) && (tpl ? tpl.enabled : true),
      templateId: tpl?.id,
      triggerMode: tpl?.trigger.mode ?? "单次即触发",
      consecutive: tpl?.trigger.consecutive ?? 1,
      alarmSeconds: tpl?.alarmSeconds ?? 0,
      flow: tpl?.flow || [],
      version: 1,
    };
  });
}
export function evaluateRule(rule: AlarmRule | undefined, value: string) {
  if (!rule || !rule.enabled)
    return {
      abnormal: false,
      reason: "规则未配置或停用，本次仅记录结果，不做判定",
      valid: false,
    };
  if (!value.trim())
    return {
      abnormal: false,
      reason: "识别结果为空，本次不做判定",
      valid: false,
    };
  if (
    rule.type === "数值范围" &&
    (!value.trim() || !Number.isFinite(Number(value)))
  )
    return { abnormal: false, reason: "无有效数值，本次不做判定", valid: false };
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
